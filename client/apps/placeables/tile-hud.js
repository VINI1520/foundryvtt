/**
 * An implementation of the PlaceableHUD base class which renders a heads-up-display interface for Tile objects.
 * @extends {BasePlaceableHUD}
 */
class TileHUD extends BasePlaceableHUD {

  /**
   * @inheritdoc
   * @type {Tile}
   */
  object = undefined;

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "tile-hud",
      template: "templates/hud/tile-hud.html"
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getData(options={}) {
    const d = this.object.document;
    const isVideo = this.object.isVideo;
    const src = this.object.sourceElement;
    const isPlaying = isVideo && !src.paused && !src.ended;

    return foundry.utils.mergeObject(super.getData(options), {
      isVideo: isVideo,
      lockedClass: d.locked ? "active" : "",
      visibilityClass: d.hidden ? "active" : "",
      overheadClass: d.overhead ? "active" : "",
      underfootClass: !d.overhead ? "active" : "",
      videoIcon: isPlaying ? "fas fa-pause" : "fas fa-play",
      videoTitle: game.i18n.localize(isPlaying ? "HUD.TilePause" : "HUD.TilePlay")
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  setPosition(options) {
    let {x, y, width, height} = this.object.hitArea;
    const c = 70;
    const p = -10;
    const position = {
      width: width + (c * 2) + (p * 2),
      height: height + (p * 2),
      left: x + this.object.x - c - p,
      top: y + this.object.y - p
    };
    this.element.css(position);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onClickControl(event) {
    super._onClickControl(event);
    if ( event.defaultPrevented ) return;
    const button = event.currentTarget;
    switch ( button.dataset.action ) {
      case "overhead":
        return this._onToggleOverhead(event, true);
      case "underfoot":
        return this._onToggleOverhead(event, false);
      case "video":
        return this._onControlVideo(event);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling the overhead state of the Tile.
   * @param {PointerEvent} event      The triggering click event
   * @param {boolean} overhead        Should the Tile be overhead?
   * @private
   */
  async _onToggleOverhead(event, overhead) {
    await canvas.scene.updateEmbeddedDocuments("Tile", this.layer.controlled.map(o => {
      return {_id: o.id, overhead: overhead};
    }));
    return this.render();
  }

  /* -------------------------------------------- */

  /**
   * Control video playback by toggling play or paused state for a video Tile.
   * @param {object} event
   * @private
   */
  _onControlVideo(event) {
    const src = this.object.sourceElement;
    const icon = event.currentTarget.children[0];
    const isPlaying = !src.paused && !src.ended;

    // Intercepting state change if the source is not looping and not playing
    if ( !src.loop && !isPlaying ) {
      const self = this;
      src.onpause = () => {
        if ( self.object?.sourceElement ) {
          icon.classList.replace("fa-pause", "fa-play");
          self.render();
        }
        src.onpause = null;
      };
    }

    return this.object.document.update({"video.autoplay": false}, {
      diff: false,
      playVideo: !isPlaying,
      offset: src.ended ? 0 : null
    });
  }
}
