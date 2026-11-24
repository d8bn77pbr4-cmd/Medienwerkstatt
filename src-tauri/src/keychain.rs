//! Gemini-Schlüssel im macOS-Schlüsselbund (Service `Medienwerkstatt`, Konto `gemini`).
//! Der Wert verlässt nie dieses Programm: nur Rust-Code ruft `get_key` auf.

use crate::error::{CmdError, CmdResult};

const SERVICE: &str = "Medienwerkstatt";
const ACCOUNT: &str = "gemini";

fn entry() -> CmdResult<keyring::Entry> {
    keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| CmdError::io(format!("Schlüsselbund: {e}")))
}

pub fn get_key() -> CmdResult<Option<String>> {
    match entry()?.get_password() {
        Ok(k) if !k.is_empty() => Ok(Some(k)),
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(CmdError::io(format!("Schlüsselbund: {e}"))),
    }
}

/// `Some(k)` speichert, `None` löscht (kein Eintrag ist kein Fehler).
pub fn set_key(key: Option<&str>) -> CmdResult<()> {
    let e = entry()?;
    match key {
        Some(k) if !k.trim().is_empty() => e
            .set_password(k.trim())
            .map_err(|e| CmdError::io(format!("Schlüsselbund: {e}"))),
        _ => match e.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(CmdError::io(format!("Schlüsselbund: {e}"))),
        },
    }
}
