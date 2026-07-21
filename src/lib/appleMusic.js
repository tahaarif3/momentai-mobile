/**
 * MomentAI Apple Music Capacitor plugin (iOS MusicKit).
 *
 * JS side registers the native plugin; Swift implementation lives under
 * ios/App/App/Plugins/AppleMusicPlugin/. Sync with `npx cap sync` after Xcode
 * adds MusicKit capability + NSAppleMusicUsageDescription.
 */

import { registerPlugin } from '@capacitor/core';

/**
 * @typedef {object} AppleMusicPlugin
 * @property {(opts: { developerToken: string }) => Promise<{ authorized: boolean }>} authorize
 * @property {(opts: { name: string, description?: string, catalogIds: string[] }) => Promise<{ playlistId: string|null, addedCount: number }>} createPlaylist
 */

/** @type {AppleMusicPlugin} */
const AppleMusic = registerPlugin('AppleMusic', {
  web: () => ({
    async authorize() {
      return { authorized: false };
    },
    async createPlaylist() {
      const err = new Error('Apple Music save is only available in the iOS app.');
      err.code = 'UNIMPLEMENTED';
      throw err;
    },
  }),
});

export default AppleMusic;
