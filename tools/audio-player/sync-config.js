// Public config. This file is served with the player. Do not put a Drive
// OAuth token, a service-account key, or a GitHub token here.
//
// driveApiKey: a referrer-restricted Google API key (Drive API only,
// https://ksl-blip.github.io/*). Required because Google blocks other
// sites from hotlinking drive.usercontent.google.com. An API key can read
// files shared as "anyone with the link"; it is not a write secret.
// webhookUrl: Grok Bot routine URL. Empty until the owner pastes one.
window.CLASSROOM_AUDIO_SYNC = {
  webhookUrl: "",
  driveApiKey: "",
  folderId: "1TsrCPfxRIx1tY0AcUWDAupKqWlXd_8F0"
};
