class CompendiumPacks extends DirectoryCollectionMixin(Collection) {

  /**
   * Get a Collection of Folders which contain Compendium Packs
   * @returns {Collection<Folder>}
   */
  get folders() {
    return game.folders.reduce((collection, folder) => {
      if ( folder.type === "Compendium" ) {
        collection.set(folder.id, folder);
      }
      return collection;
    }, new Collection());
  }

  /* -------------------------------------------- */

  /** @override */
  _getVisibleTreeContents() {
    return this.contents.filter(pack => pack.visible);
  }

  /* -------------------------------------------- */

  /** @override */
  static _sortAlphabetical(a, b) {
    if ( a.metadata && b.metadata ) return a.metadata.label.localeCompare(b.metadata.label);
    else return super._sortAlphabetical(a, b);
  }
}
