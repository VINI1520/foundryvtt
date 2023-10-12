/**
 * The client-side Playlist document which extends the common BasePlaylist model.
 * @extends documents.BasePlaylist
 * @mixes ClientDocumentMixin
 *
 * @see {@link Playlists}             The world-level collection of Playlist documents
 * @see {@link PlaylistSound}         The PlaylistSound embedded document within a parent Playlist
 * @see {@link PlaylistConfig}        The Playlist configuration application
 */
class Playlist extends ClientDocumentMixin(foundry.documents.BasePlaylist) {


  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Playlists may have a playback order which defines the sequence of Playlist Sounds
   * @type {string[]}
   */
  _playbackOrder;

  /**
   * The order in which sounds within this playlist will be played (if sequential or shuffled)
   * Uses a stored seed for randomization to guarantee that all clients generate the same random order.
   * @type {string[]}
   */
  get playbackOrder() {
    if ( this._playbackOrder !== undefined ) return this._playbackOrder;
    switch ( this.mode ) {

      // Shuffle all tracks
      case CONST.PLAYLIST_MODES.SHUFFLE:
        let ids = this.sounds.map(s => s.id);
        const mt = new MersenneTwister(this.seed ?? 0);
        let shuffle = ids.reduce((shuffle, id) => {
          shuffle[id] = mt.random();
          return shuffle;
        }, {});
        ids.sort((a, b) => shuffle[a] - shuffle[b]);
        return this._playbackOrder = ids;

      // Sorted sequential playback
      default:
        const sorted = this.sounds.contents.sort(this._sortSounds.bind(this));
        return this._playbackOrder = sorted.map(s => s.id);
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  get visible() {
    return game.user.isGM || this.playing;
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Find all content links belonging to a given {@link Playlist} or {@link PlaylistSound}.
   * @param {Playlist|PlaylistSound} doc  The Playlist or PlaylistSound.
   * @returns {NodeListOf<Element>}
   * @protected
   */
  static _getSoundContentLinks(doc) {
    return document.querySelectorAll(`a.content-link[data-uuid="${doc.uuid}"]`);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  prepareDerivedData() {
    this.playing = this.sounds.some(s => s.playing);
  }

  /* -------------------------------------------- */

  /**
   * Begin simultaneous playback for all sounds in the Playlist.
   * @returns {Promise<Playlist>} The updated Playlist document
   */
  async playAll() {
    if ( this.sounds.size === 0 ) return this;
    const updateData = { playing: true };
    const order = this.playbackOrder;

    // Handle different playback modes
    switch (this.mode) {

      // Soundboard Only
      case CONST.PLAYLIST_MODES.DISABLED:
        updateData.playing = false;
        break;

      // Sequential or Shuffled Playback
      case CONST.PLAYLIST_MODES.SEQUENTIAL:
      case CONST.PLAYLIST_MODES.SHUFFLE:
        const paused = this.sounds.find(s => s.pausedTime);
        const nextId = paused?.id || order[0];
        updateData.sounds = this.sounds.map(s => {
          return {_id: s.id, playing: s.id === nextId};
        });
        break;

      // Simultaneous - play all tracks
      case CONST.PLAYLIST_MODES.SIMULTANEOUS:
        updateData.sounds = this.sounds.map(s => {
          return {_id: s.id, playing: true};
        });
        break;
    }

    // Update the Playlist
    return this.update(updateData);
  }

  /* -------------------------------------------- */

  /**
   * Play the next Sound within the sequential or shuffled Playlist.
   * @param {string} [soundId]      The currently playing sound ID, if known
   * @param {object} [options={}]   Additional options which configure the next track
   * @param {number} [options.direction=1] Whether to advance forward (if 1) or backwards (if -1)
   * @returns {Promise<Playlist>}   The updated Playlist document
   */
  async playNext(soundId, {direction=1}={}) {
    if ( ![CONST.PLAYLIST_MODES.SEQUENTIAL, CONST.PLAYLIST_MODES.SHUFFLE].includes(this.mode) ) return null;

    // Determine the next sound
    if ( !soundId ) {
      const current = this.sounds.find(s => s.playing);
      soundId = current?.id || null;
    }
    let next = direction === 1 ? this._getNextSound(soundId) : this._getPreviousSound(soundId);
    if ( !this.playing ) next = null;

    // Enact playlist updates
    const sounds = this.sounds.map(s => {
      return {_id: s.id, playing: s.id === next?.id, pausedTime: null};
    });
    return this.update({sounds});
  }

  /* -------------------------------------------- */

  /**
   * Begin playback of a specific Sound within this Playlist.
   * Determine which other sounds should remain playing, if any.
   * @param {PlaylistSound} sound       The desired sound that should play
   * @returns {Promise<Playlist>}       The updated Playlist
   */
  async playSound(sound) {
    const updates = {playing: true};
    switch ( this.mode ) {
      case CONST.PLAYLIST_MODES.SEQUENTIAL:
      case CONST.PLAYLIST_MODES.SHUFFLE:
        updates.sounds = this.sounds.map(s => {
          let isPlaying = s.id === sound.id;
          return {_id: s.id, playing: isPlaying, pausedTime: isPlaying ? s.pausedTime : null};
        });
        break;
      default:
        updates.sounds = [{_id: sound.id, playing: true}];
    }
    return this.update(updates);
  }

  /* -------------------------------------------- */

  /**
   * Stop playback of a specific Sound within this Playlist.
   * Determine which other sounds should remain playing, if any.
   * @param {PlaylistSound} sound       The desired sound that should play
   * @returns {Promise<Playlist>}       The updated Playlist
   */
  async stopSound(sound) {
    return this.update({
      playing: this.sounds.some(s => (s.id !== sound.id) && s.playing),
      sounds: [{_id: sound.id, playing: false, pausedTime: null}]
    });
  }

  /* -------------------------------------------- */

  /**
   * End playback for any/all currently playing sounds within the Playlist.
   * @returns {Promise<Playlist>} The updated Playlist document
   */
  async stopAll() {
    return this.update({
      playing: false,
      sounds: this.sounds.map(s => {
        return {_id: s.id, playing: false};
      })
    });
  }

  /* -------------------------------------------- */

  /**
   * Cycle the playlist mode
   * @return {Promise.<Playlist>}   A promise which resolves to the updated Playlist instance
   */
  async cycleMode() {
    const modes = Object.values(CONST.PLAYLIST_MODES);
    let mode = this.mode + 1;
    mode = mode > Math.max(...modes) ? modes[0] : mode;
    for ( let s of this.sounds ) {
      s.playing = false;
    }
    return this.update({sounds: this.sounds.toJSON(), mode: mode});
  }

  /* -------------------------------------------- */

  /**
   * Get the next sound in the cached playback order. For internal use.
   * @private
   */
  _getNextSound(soundId) {
    const order = this.playbackOrder;
    let idx = order.indexOf(soundId);
    if (idx === order.length - 1) idx = -1;
    return this.sounds.get(order[idx+1]);
  }

  /* -------------------------------------------- */

  /**
   * Get the previous sound in the cached playback order. For internal use.
   * @private
   */
  _getPreviousSound(soundId) {
    const order = this.playbackOrder;
    let idx = order.indexOf(soundId);
    if ( idx === -1 ) idx = 1;
    else if (idx === 0) idx = order.length;
    return this.sounds.get(order[idx-1]);
  }

  /* -------------------------------------------- */

  /**
   * Define the sorting order for the Sounds within this Playlist. For internal use.
   * @private
   */
  _sortSounds(a, b) {
    switch ( this.sorting ) {
      case CONST.PLAYLIST_SORT_MODES.ALPHABETICAL: return a.name.localeCompare(b.name);
      case CONST.PLAYLIST_SORT_MODES.MANUAL: return a.sort - b.sort;
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  toAnchor({classes=[], ...options}={}) {
    if ( this.playing ) classes.push("playing");
    if ( !game.user.isGM ) classes.push("disabled");
    return super.toAnchor({classes, ...options});
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onClickDocumentLink(event) {
    if ( this.playing ) return this.stopAll();
    return this.playAll();
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @inheritdoc */
  async _preUpdate(changed, options, user) {
    if ((("mode" in changed) || ("playing" in changed)) && !("seed" in changed)) {
      changed.seed = Math.floor(Math.random() * 1000);
    }
    return super._preUpdate(changed, options, user);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if ( "seed" in changed || "mode" in changed || "sorting" in changed ) this._playbackOrder = undefined;
    if ( "sounds" in changed ) this.sounds.forEach(s => s.sync());
    this._updateContentLinkPlaying(changed);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    this.sounds.forEach(s => s.sound.stop());
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
    super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);
    if ( options.render !== false ) this.collection.render();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId) {
    super._onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId);
    if ( options.render !== false ) this.collection.render();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId) {
    super._onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId);
    if ( options.render !== false ) this.collection.render();
  }

  /* -------------------------------------------- */

  /**
   * Handle callback logic when an individual sound within the Playlist concludes playback naturally
   * @param {PlaylistSound} sound
   * @private
   */
  async _onSoundEnd(sound) {
    switch ( this.mode ) {
      case CONST.PLAYLIST_MODES.SEQUENTIAL:
      case CONST.PLAYLIST_MODES.SHUFFLE:
        return this.playNext(sound.id);
      case CONST.PLAYLIST_MODES.SIMULTANEOUS:
      case CONST.PLAYLIST_MODES.DISABLED:
        const updates = {playing: true, sounds: [{_id: sound.id, playing: false, pausedTime: null}]};
        for ( let s of this.sounds ) {
          if ( (s !== sound) && s.playing ) break;
          updates.playing = false;
        }
        return this.update(updates);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle callback logic when playback for an individual sound within the Playlist is started.
   * Schedule auto-preload of next track
   * @param {PlaylistSound} sound
   * @private
   */
  async _onSoundStart(sound) {
    if ( ![CONST.PLAYLIST_MODES.SEQUENTIAL, CONST.PLAYLIST_MODES.SHUFFLE].includes(this.mode) ) return;
    const apl = CONFIG.Playlist.autoPreloadSeconds;
    if ( Number.isNumeric(apl) && Number.isFinite(sound.sound.duration) ) {
      setTimeout(() => {
        if ( !sound.playing ) return;
        const next = this._getNextSound(sound.id);
        if ( next ) next.sound.load();
      }, (sound.sound.duration - apl) * 1000);
    }
  }

  /* -------------------------------------------- */

  /**
   * Update the playing status of this Playlist in content links.
   * @param {object} changed  The data changes.
   * @private
   */
  _updateContentLinkPlaying(changed) {
    if ( "playing" in changed ) {
      this.constructor._getSoundContentLinks(this).forEach(el => el.classList.toggle("playing", changed.playing));
    }
    if ( "sounds" in changed ) changed.sounds.forEach(update => {
      const sound = this.sounds.get(update._id);
      if ( !("playing" in update) || !sound ) return;
      this.constructor._getSoundContentLinks(sound).forEach(el => el.classList.toggle("playing", update.playing));
    });
  }

  /* -------------------------------------------- */
  /*  Importing and Exporting                     */
  /* -------------------------------------------- */

  /** @inheritdoc */
  toCompendium(pack, options={}) {
    const data = super.toCompendium(pack, options);
    if ( options.clearState ) {
      data.playing = false;
      for ( let s of data.sounds ) {
        s.playing = false;
      }
    }
    return data;
  }
}
