/**
 * The singleton collection of Playlist documents which exist within the active World.
 * This Collection is accessible within the Game object as game.playlists.
 * @extends {WorldCollection}
 *
 * @see {@link Playlist} The Playlist document
 * @see {@link PlaylistDirectory} The PlaylistDirectory sidebar directory
 */
class Playlists extends WorldCollection {
  constructor(...args) {
    super(...args);
    this.initialize();
  }

  /* -------------------------------------------- */

  /** @override */
  static documentName = "Playlist";

  /* -------------------------------------------- */

  /**
   * Return the subset of Playlist documents which are currently playing
   * @type {Playlist[]}
   */
  get playing() {
    return this.filter(s => s.playing);
  }

  /* -------------------------------------------- */

  /**
   * Perform one-time initialization to begin playback of audio
   */
  initialize() {
    for ( let playlist of this ) {
      for ( let sound of playlist.sounds ) {
        sound.sync();
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle changes to a Scene to determine whether to trigger changes to Playlist documents.
   * @param {Scene} scene       The Scene document being updated
   * @param {Object} data       The incremental update data
   */
  async _onChangeScene(scene, data) {
    const currentScene = game.scenes.active;
    const p0 = currentScene?.playlist;
    const s0 = currentScene?.playlistSound;
    const p1 = ("playlist" in data) ? game.playlists.get(data.playlist) : scene.playlist;
    const s1 = "playlistSound" in data ? p1?.sounds.get(data.playlistSound) : scene.playlistSound;
    const soundChange = (p0 !== p1) || (s0 !== s1);
    if ( soundChange ) {
      if ( s0 ) await s0.update({playing: false});
      else if ( p0 ) await p0.stopAll();
      if ( s1 ) await s1.update({playing: true});
      else if ( p1 ) await p1.playAll();
    }
  }
}
