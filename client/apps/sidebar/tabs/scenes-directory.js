/**
 * The sidebar directory which organizes and displays world-level Scene documents.
 * @extends {DocumentDirectory}
 */
class SceneDirectory extends DocumentDirectory {

  /** @override */
  static documentName = "Scene";

  /** @override */
  static entryPartial = "templates/sidebar/scene-partial.html";

  /* -------------------------------------------- */

  /** @inheritdoc */
  static get defaultOptions() {
    const options = super.defaultOptions;
    options.renderUpdateKeys.push("background");
    return options;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _render(force, options) {
    if ( !game.user.isGM ) return;
    return super._render(force, options);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _getEntryContextOptions() {
    let options = super._getEntryContextOptions();
    options = [
      {
        name: "SCENES.View",
        icon: '<i class="fas fa-eye"></i>',
        condition: li => !canvas.ready || (li.data("documentId") !== canvas.scene.id),
        callback: li => {
          const scene = game.scenes.get(li.data("documentId"));
          scene.view();
        }
      },
      {
        name: "SCENES.Activate",
        icon: '<i class="fas fa-bullseye"></i>',
        condition: li => game.user.isGM && !game.scenes.get(li.data("documentId")).active,
        callback: li => {
          const scene = game.scenes.get(li.data("documentId"));
          scene.activate();
        }
      },
      {
        name: "SCENES.Configure",
        icon: '<i class="fas fa-cogs"></i>',
        callback: li => {
          const scene = game.scenes.get(li.data("documentId"));
          scene.sheet.render(true);
        }
      },
      {
        name: "SCENES.Notes",
        icon: '<i class="fas fa-scroll"></i>',
        condition: li => {
          const scene = game.scenes.get(li.data("documentId"));
          return !!scene.journal;
        },
        callback: li => {
          const scene = game.scenes.get(li.data("documentId"));
          const entry = scene.journal;
          if ( entry ) {
            const sheet = entry.sheet;
            const options = {};
            if ( scene.journalEntryPage ) options.pageId = scene.journalEntryPage;
            sheet.render(true, options);
          }
        }
      },
      {
        name: "SCENES.ToggleNav",
        icon: '<i class="fas fa-compass"></i>',
        condition: li => {
          const scene = game.scenes.get(li.data("documentId"));
          return game.user.isGM && ( !scene.active );
        },
        callback: li => {
          const scene = game.scenes.get(li.data("documentId"));
          scene.update({navigation: !scene.navigation});
        }
      },
      {
        name: "SCENES.GenerateThumb",
        icon: '<i class="fas fa-image"></i>',
        condition: li => {
          const scene = game.scenes.get(li[0].dataset.documentId);
          return (scene.background.src || scene.tiles.size) && !game.settings.get("core", "noCanvas");
        },
        callback: li => {
          const scene = game.scenes.get(li[0].dataset.documentId);
          scene.createThumbnail().then(data => {
            scene.update({thumb: data.thumb}, {diff: false});
            ui.notifications.info(game.i18n.format("SCENES.GenerateThumbSuccess", {name: scene.name}));
          }).catch(err => ui.notifications.error(err.message));
        }
      }
    ].concat(options);

    // Remove the ownership entry
    options.findSplice(o => o.name === "OWNERSHIP.Configure");
    return options;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _getFolderContextOptions() {
    const options = super._getFolderContextOptions();
    options.findSplice(o => o.name === "OWNERSHIP.Configure");
    return options;
  }
}
