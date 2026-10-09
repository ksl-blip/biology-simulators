// Public config. This file is served with the player. Do not put a Drive
// OAuth token, a service-account key, a Drive API key, or a GitHub token here.
//
// webhookUrl: Grok Bot routine URL.
// The routine should download the classroom MP3s and commit them under
// tools/audio-player/media/ together with tracks.json. Playback uses those
// files. Do not write Drive stream URLs into the playlist.
// folderId names the Drive folder the routine should read.
window.CLASSROOM_AUDIO_SYNC = {
  webhookUrl: "grokbot://app/v1/sidebar?target=webhook-url&automation=drive",
  folderId: "1TsrCPfxRIx1tY0AcUWDAupKqWlXd_8F0"
};
