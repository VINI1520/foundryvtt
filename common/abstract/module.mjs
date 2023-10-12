import DataModel from "./data.mjs";

export * from "./data.mjs";
export {default as Document} from "./document.mjs";
export {default as DatabaseBackend} from "./backend.mjs";
export {default as EmbeddedCollection} from "./embedded-collection.mjs";

/**
 * @deprecated since v10
 * @see DataModel
 * @ignore
 */
export class DocumentData extends DataModel {
  constructor(...args) {
    foundry.utils.logCompatibilityWarning("You are using the DocumentData class which has been renamed to DataModel.",
      {since: 10, until: 12});
    super(...args);
  }
}
