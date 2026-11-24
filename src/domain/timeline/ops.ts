// Schnittfunktionen, nach Familien auf ops/*.ts verteilt.
export { insertEdit, addTitle, razor, addEditAll, toggleLink, setClipProps, type ClipPatch } from './ops/insert';
export { liftDelete, rippleDelete, moveClips } from './ops/delete';
export { trim, roll, rippleTrimToPlayhead } from './ops/trim';
export { addTransition, removeTransition, setTransitionDuration } from './ops/transition';
export type { OpOpts } from './ops/common';
