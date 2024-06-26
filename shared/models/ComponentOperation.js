/**
 * Define what interactions are busy so multiple component clicks do not make multiple invocations
 */
const BUSY_PLUGIN_INTERACTIONS = new Set();

export default class ComponentOperation { // todo: PluginOperation
  /**
   * Create a ComponentOperation
   * @param {Object} param
   * @param {string} param.interactionId The Discord.js interaction customId
   * @param {string} param.messageId The Discord.js messageId
   * @param {string} param.userId the Discord.js userId
   */
  constructor({ interactionId, messageId, userId }) {
    this.interactionId = interactionId;
    this.messageId = messageId;
    this.userId = userId;
  }

  get isBusy() {
    return BUSY_PLUGIN_INTERACTIONS.has(`${this}`);
  }

  setBusy(bool) {
    if (bool) !this.isBusy && BUSY_PLUGIN_INTERACTIONS.add(`${this}`);
    else this.isBusy && BUSY_PLUGIN_INTERACTIONS.delete(`${this}`);
  }

  toString() {
    return this.interactionId + this.messageId + this.userId;
  }
}