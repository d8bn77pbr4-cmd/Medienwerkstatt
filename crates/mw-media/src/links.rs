//! Link-Prüfung für Recherche-Quellen (`check_urls`): Gibt es die Seite noch?
//!
//! Nur http(s), höchstens sechs Links, je Link 6 s und höchstens drei Weiterleitungen. Vor jeder Verbindung (auch nach
//! einer Weiterleitung) wird der Host aufgelöst; Loopback-, private, link-lokale, unbestimmte und Multicast-Adressen
//! (IPv4 und IPv6) werden abgelehnt und gelten als „nicht erreichbar“. Gesendet wird nur die Adresse selbst mit dem
//! neutralen User-Agent `Medienwerkstatt/0.1` – keine Zugangsdaten, keine Cookies, keine persönlichen Daten.
//! Nichts hier läuft von selbst; die App ruft es nur beim Abgeben einer Recherche auf.

use serde::Serialize;
use std::io;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, ToSocketAddrs};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};
use url::Url;

/// Höchstens so viele Links je Aufruf; weitere fallen weg.
pub const MAX_URLS: usize = 6;
/// Zeitlimit je Link (alle Weiterleitungen zusammen).
pub const TIMEOUT: Duration = Duration::from_secs(6);
/// Höchstens so viele Weiterleitungen je Link.
pub const MAX_REDIRECTS: usize = 3;
/// Neutraler User-Agent ohne Angaben zur Person oder zum Gerät.
pub const USER_AGENT: &str = "Medienwerkstatt/0.1";

/// Ergebnis je Link: erreichbar, Seite fehlt (404/410) oder keine brauchbare Antwort.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LinkStatus {
    Ok,
    NotFound,
    Unreachable,
}

/// Ein geprüfter Link (`url` genau wie übergeben).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct UrlCheck {
    pub url: String,
    pub result: LinkStatus,
}

/// Darf die App diese Adresse ansprechen? Nein für Loopback, private Netze, link-lokal, unbestimmt, Multicast,
/// Broadcast und reservierte Bereiche; IPv6 mit eingebetteter IPv4-Adresse wird wie diese geprüft.
pub fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_public_v4(v4),
        IpAddr::V6(v6) => is_public_v6(v6),
    }
}

fn is_public_v4(ip: Ipv4Addr) -> bool {
    let [a, b, ..] = ip.octets();
    !(ip.is_loopback()
        || ip.is_private()
        || ip.is_link_local()
        || ip.is_unspecified()
        || ip.is_multicast()
        || ip.is_broadcast()
        || a == 0 // 0.0.0.0/8 „dieses Netz“
        || (a == 100 && (b & 0xc0) == 64) // 100.64.0.0/10 Carrier-NAT
        || a >= 240) // 240.0.0.0/4 reserviert
}

fn is_public_v6(ip: Ipv6Addr) -> bool {
    let s = ip.segments();
    // ::ffff:a.b.c.d (IPv4-gemappt) und ::a.b.c.d (IPv4-kompatibel, auch :: und ::1) wie IPv4 prüfen.
    if let Some(v4) = ip.to_ipv4_mapped() {
        return is_public_v4(v4);
    }
    if s[..6] == [0; 6] {
        return is_public_v4(Ipv4Addr::from(((s[6] as u32) << 16) | s[7] as u32));
    }
    // 64:ff9b::/96 (NAT64) bettet eine IPv4-Adresse ein.
    if s[0] == 0x64 && s[1] == 0xff9b && s[2..6] == [0; 4] {
        return is_public_v4(Ipv4Addr::from(((s[6] as u32) << 16) | s[7] as u32));
    }
    !(ip.is_loopback()
        || ip.is_unspecified()
        || ip.is_multicast()
        || (s[0] & 0xfe00) == 0xfc00 // fc00::/7 eindeutig lokal (privat)
        || (s[0] & 0xffc0) == 0xfe80 // fe80::/10 link-lokal
        || (s[0] & 0xffc0) == 0xfec0) // fec0::/10 site-lokal (veraltet)
}

/// Prüft einen Link: nur http(s) mit Host. Zugangsdaten (`user:pass@`) und Anker werden entfernt, damit nie etwas
/// davon gesendet wird. `None`: kein prüfbarer Link.
pub fn parse_check_url(s: &str) -> Option<Url> {
    let mut url = Url::parse(s.trim()).ok()?;
    if !matches!(url.scheme(), "http" | "https") {
        return None;
    }
    if url.host_str().is_none_or(str::is_empty) {
        return None;
    }
    url.set_username("").ok()?;
    url.set_password(None).ok()?;
    url.set_fragment(None);
    Some(url)
}

/// Löst `host:port` auf und lehnt ab, sobald eine Adresse nicht öffentlich ist (auch bei gemischten Antworten).
pub fn resolve_public(netloc: &str) -> io::Result<Vec<SocketAddr>> {
    let addrs: Vec<SocketAddr> = netloc.to_socket_addrs()?.collect();
    if addrs.is_empty() {
        return Err(io::Error::new(io::ErrorKind::NotFound, "keine Adresse"));
    }
    if addrs.iter().any(|a| !is_public_ip(a.ip())) {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "lokale oder private Adresse",
        ));
    }
    Ok(addrs)
}

/// HTTP-Status → Ergebnis: 2xx/3xx ok, 401/403/429 ok (die Seite gibt es, sie sperrt nur Programme),
/// 404/410 nicht gefunden, alles andere nicht erreichbar.
pub fn classify(status: u16) -> LinkStatus {
    match status {
        200..=399 | 401 | 403 | 429 => LinkStatus::Ok,
        404 | 410 => LinkStatus::NotFound,
        _ => LinkStatus::Unreachable,
    }
}

/// Namensauflösung mit Adressprüfung (in der App immer `resolve_public`).
type Resolve = fn(&str) -> io::Result<Vec<SocketAddr>>;

/// Eine Anfrage ohne automatische Weiterleitung; liefert Status und `Location`. `None` bei Netz- oder
/// Adressfehler (auch abgelehnte private Adressen).
fn request(
    method: &str,
    url: &Url,
    remaining: Duration,
    resolve: Resolve,
) -> Option<(u16, Option<String>)> {
    let agent = ureq::AgentBuilder::new()
        .redirects(0)
        .timeout_connect(remaining)
        .user_agent(USER_AGENT)
        .resolver(resolve)
        .build();
    // Antwort nur bis zu den Kopfzeilen lesen: der Körper wird nie gelesen (auch nicht beim GET).
    match agent.request_url(method, url).timeout(remaining).call() {
        Ok(r) => Some((r.status(), r.header("location").map(str::to_owned))),
        Err(ureq::Error::Status(code, r)) => Some((code, r.header("location").map(str::to_owned))),
        Err(ureq::Error::Transport(_)) => None,
    }
}

/// Prüft einen Link: erst HEAD, bei 405/501 GET; Weiterleitungen selbst folgen (höchstens drei, jedes Ziel wieder
/// mit Adressprüfung), alles innerhalb von `TIMEOUT`.
pub fn check_url(raw: &str) -> LinkStatus {
    check_url_with(raw, resolve_public)
}

fn check_url_with(raw: &str, resolve: Resolve) -> LinkStatus {
    let Some(mut url) = parse_check_url(raw) else {
        return LinkStatus::Unreachable;
    };
    let deadline = Instant::now() + TIMEOUT;
    let mut method = "HEAD";
    let mut redirects = 0;
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return LinkStatus::Unreachable;
        }
        let Some((status, location)) = request(method, &url, remaining, resolve) else {
            return LinkStatus::Unreachable;
        };
        if method == "HEAD" && matches!(status, 405 | 501) {
            method = "GET";
            continue;
        }
        if (300..400).contains(&status) && redirects < MAX_REDIRECTS {
            if let Some(location) = location {
                match url
                    .join(&location)
                    .ok()
                    .and_then(|u| parse_check_url(u.as_str()))
                {
                    Some(next) => {
                        url = next;
                        redirects += 1;
                        continue;
                    }
                    None => return LinkStatus::Unreachable,
                }
            }
        }
        return classify(status);
    }
}

/// Prüft höchstens `MAX_URLS` Links parallel (je ein Thread); Reihenfolge wie übergeben, der Rest fällt weg.
/// Ungültige Links (kein http(s)) gehen nicht ins Netz und gelten als nicht erreichbar.
pub fn check_urls(urls: &[String]) -> Vec<UrlCheck> {
    let urls: Vec<String> = urls.iter().take(MAX_URLS).cloned().collect();
    let (tx, rx) = mpsc::channel();
    for (i, url) in urls.iter().enumerate() {
        let tx = tx.clone();
        let url = url.clone();
        thread::spawn(move || {
            let _ = tx.send((i, check_url(&url)));
        });
    }
    drop(tx);
    // Hängt eine Namensauflösung (ureq kennt dafür kein Zeitlimit), wartet der Aufruf trotzdem nicht länger.
    let deadline = Instant::now() + TIMEOUT + Duration::from_millis(500);
    let mut results = vec![LinkStatus::Unreachable; urls.len()];
    let mut open = urls.len();
    while open > 0 {
        let remaining = deadline.saturating_duration_since(Instant::now());
        match rx.recv_timeout(remaining) {
            Ok((i, status)) => {
                results[i] = status;
                open -= 1;
            }
            Err(_) => break,
        }
    }
    urls.into_iter()
        .zip(results)
        .map(|(url, result)| UrlCheck { url, result })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ip(s: &str) -> IpAddr {
        s.parse().unwrap()
    }

    #[test]
    fn refuses_local_private_and_special_ipv4() {
        for s in [
            "127.0.0.1",
            "127.255.0.9",
            "10.0.0.1",
            "172.16.5.4",
            "172.31.255.255",
            "192.168.1.10",
            "169.254.169.254",
            "0.0.0.0",
            "0.1.2.3",
            "224.0.0.1",
            "239.255.255.250",
            "255.255.255.255",
            "100.64.0.1",
            "240.0.0.1",
        ] {
            assert!(!is_public_ip(ip(s)), "{s} sollte abgelehnt werden");
        }
    }

    #[test]
    fn allows_public_ipv4() {
        for s in [
            "8.8.8.8",
            "1.1.1.1",
            "172.32.0.1",
            "192.169.0.1",
            "100.128.0.1",
            "93.184.216.34",
        ] {
            assert!(is_public_ip(ip(s)), "{s} ist öffentlich");
        }
    }

    #[test]
    fn refuses_local_private_and_special_ipv6() {
        for s in [
            "::1",
            "::",
            "fe80::1",
            "febf::1",
            "fc00::1",
            "fd12:3456::1",
            "fec0::1",
            "ff02::1",
            "ff0e::1",
            "::ffff:127.0.0.1",
            "::ffff:192.168.0.1",
            "::ffff:10.1.2.3",
            "::127.0.0.1",
            "64:ff9b::7f00:1",
            "64:ff9b::a9fe:a9fe",
        ] {
            assert!(!is_public_ip(ip(s)), "{s} sollte abgelehnt werden");
        }
    }

    #[test]
    fn allows_public_ipv6() {
        for s in [
            "2001:4860:4860::8888",
            "2606:4700:4700::1111",
            "::ffff:8.8.8.8",
            "64:ff9b::808:808",
        ] {
            assert!(is_public_ip(ip(s)), "{s} ist öffentlich");
        }
    }

    #[test]
    fn url_validation_accepts_only_http_and_https_with_host() {
        assert_eq!(
            parse_check_url(" https://www.zdf.de/doku#teil-2 ").map(|u| u.to_string()),
            Some("https://www.zdf.de/doku".to_string())
        );
        assert!(parse_check_url("http://example.org").is_some());
        assert!(parse_check_url("HTTPS://ZDF.DE/").is_some());
        for bad in [
            "ftp://zdf.de/x",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "mailto:a@b.de",
            "zdf.de",
            "",
            "https://",
            "data:text/plain,hi",
        ] {
            assert!(
                parse_check_url(bad).is_none(),
                "{bad} ist kein prüfbarer Link"
            );
        }
    }

    #[test]
    fn url_validation_strips_credentials() {
        let u = parse_check_url("https://anna:geheim@www.zdf.de/x").unwrap();
        assert_eq!(u.as_str(), "https://www.zdf.de/x");
        assert_eq!(u.username(), "");
        assert_eq!(u.password(), None);
    }

    #[test]
    fn resolver_refuses_literal_and_localhost_addresses() {
        assert!(resolve_public("127.0.0.1:80").is_err());
        assert!(resolve_public("[::1]:443").is_err());
        assert!(resolve_public("192.168.0.1:80").is_err());
        assert!(resolve_public("localhost:80").is_err());
        assert_eq!(
            resolve_public("8.8.8.8:443").unwrap(),
            vec!["8.8.8.8:443".parse::<SocketAddr>().unwrap()]
        );
    }

    #[test]
    fn status_classes() {
        for s in [200, 204, 301, 302, 304, 399, 401, 403, 429] {
            assert_eq!(classify(s), LinkStatus::Ok, "{s}");
        }
        assert_eq!(classify(404), LinkStatus::NotFound);
        assert_eq!(classify(410), LinkStatus::NotFound);
        for s in [400, 405, 418, 500, 502, 503, 199] {
            assert_eq!(classify(s), LinkStatus::Unreachable, "{s}");
        }
    }

    #[test]
    fn local_targets_are_unreachable_without_any_connection() {
        // Kein Netz nötig: die Adressprüfung lehnt ab, bevor eine Verbindung aufgebaut wird.
        for u in [
            "http://127.0.0.1:1/",
            "http://localhost:9/x",
            "http://[::1]/",
            "http://192.168.0.1/",
            "http://169.254.169.254/latest/meta-data/",
        ] {
            assert_eq!(check_url(u), LinkStatus::Unreachable, "{u}");
        }
    }

    #[test]
    fn at_most_six_urls_in_input_order_and_invalid_ones_stay_offline() {
        let urls: Vec<String> = (0..8).map(|i| format!("ftp://quelle{i}.de/")).collect();
        let out = check_urls(&urls);
        assert_eq!(out.len(), MAX_URLS);
        for (i, c) in out.iter().enumerate() {
            assert_eq!(c.url, format!("ftp://quelle{i}.de/"));
            assert_eq!(c.result, LinkStatus::Unreachable);
        }
        assert!(check_urls(&[]).is_empty());
    }

    /// Winziger HTTP-Server auf 127.0.0.1 für den Ablauf (HEAD/GET, Weiterleitungen); nur die Test-Auflösung
    /// lässt diese eine Loopback-Adresse zu, alles andere läuft durch `resolve_public`.
    fn serve() -> (u16, mpsc::Receiver<String>) {
        use std::io::{BufRead, BufReader, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let (tx, rx) = mpsc::channel();
        thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let mut head = Vec::new();
                loop {
                    let mut line = String::new();
                    if reader.read_line(&mut line).unwrap_or(0) == 0 || line == "\r\n" {
                        break;
                    }
                    head.push(line.trim_end().to_string());
                }
                let first = head.first().cloned().unwrap_or_default();
                let _ = tx.send(head.join("\n"));
                let mut parts = first.split(' ');
                let (method, path) = (parts.next().unwrap_or(""), parts.next().unwrap_or(""));
                let (status, location) = match (method, path) {
                    ("HEAD", "/nur-get") => ("405 Method Not Allowed", None),
                    ("GET", "/nur-get") => ("200 OK", None),
                    (_, "/umgezogen") => ("301 Moved Permanently", Some("/weg".to_string())),
                    (_, "/weg") => ("404 Not Found", None),
                    (_, "/kreis") => ("302 Found", Some("/kreis".to_string())),
                    (_, "/nach-privat") => ("302 Found", Some("http://192.168.0.1/".to_string())),
                    (_, "/nach-ftp") => ("302 Found", Some("ftp://example.org/".to_string())),
                    (_, "/gesperrt") => ("403 Forbidden", None),
                    (_, "/kaputt") => ("500 Internal Server Error", None),
                    _ => ("200 OK", None),
                };
                let loc = location
                    .map(|l| format!("Location: {l}\r\n"))
                    .unwrap_or_default();
                let mut s = stream;
                let _ = write!(
                    s,
                    "HTTP/1.1 {status}\r\n{loc}Content-Length: 0\r\nConnection: close\r\n\r\n"
                );
            }
        });
        (port, rx)
    }

    fn loopback_too(netloc: &str) -> io::Result<Vec<SocketAddr>> {
        if netloc.starts_with("127.0.0.1:") {
            return netloc.to_socket_addrs().map(|a| a.collect());
        }
        resolve_public(netloc)
    }

    #[test]
    fn flow_head_then_get_redirects_and_status() {
        let (port, requests) = serve();
        let url = |p: &str| format!("http://127.0.0.1:{port}{p}");
        let check = |p: &str| check_url_with(&url(p), loopback_too);
        assert_eq!(check("/"), LinkStatus::Ok);
        assert_eq!(check("/nur-get"), LinkStatus::Ok);
        assert_eq!(check("/umgezogen"), LinkStatus::NotFound);
        assert_eq!(
            check("/kreis"),
            LinkStatus::Ok,
            "nach drei Weiterleitungen zählt die 3xx-Antwort"
        );
        assert_eq!(
            check("/nach-privat"),
            LinkStatus::Unreachable,
            "Weiterleitungsziel mit privater Adresse"
        );
        assert_eq!(check("/nach-ftp"), LinkStatus::Unreachable);
        assert_eq!(check("/gesperrt"), LinkStatus::Ok);
        assert_eq!(check("/kaputt"), LinkStatus::Unreachable);
        // Gesendet: HEAD, bei 405 GET, eigener User-Agent, nichts Persönliches; drei Weiterleitungen beim Kreis.
        let seen: Vec<String> = requests.try_iter().collect();
        let lines: Vec<&str> = seen
            .iter()
            .map(|h| h.lines().next().unwrap_or(""))
            .collect();
        assert_eq!(
            lines.iter().filter(|l| l.starts_with("GET ")).count(),
            1,
            "{lines:?}"
        );
        assert_eq!(
            lines.iter().filter(|l| l.contains("/kreis")).count(),
            1 + MAX_REDIRECTS
        );
        for h in &seen {
            assert!(h.contains("User-Agent: Medienwerkstatt/0.1"), "{h}");
            assert!(
                !h.to_lowercase().contains("cookie") && !h.to_lowercase().contains("authorization"),
                "{h}"
            );
        }
    }

    #[test]
    fn serializes_like_the_typescript_interface() {
        let c = UrlCheck {
            url: "https://a.de".into(),
            result: LinkStatus::NotFound,
        };
        assert_eq!(
            serde_json::to_string(&c).unwrap(),
            r#"{"url":"https://a.de","result":"notFound"}"#
        );
        assert_eq!(serde_json::to_string(&LinkStatus::Ok).unwrap(), r#""ok""#);
        assert_eq!(
            serde_json::to_string(&LinkStatus::Unreachable).unwrap(),
            r#""unreachable""#
        );
    }
}
