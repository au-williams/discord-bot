import { getTruncatedString } from "../helpers/utilities.js";

export default class CachedLinkData {
  constructor({
    authorName,
    endTime,
    id,
    linkWithoutParameters,
    message,
    segments,
    title
   }) {
    this.authorName = authorName;
    this.endTime = endTime;
    this.id = id;
    this.linkWithoutParameters = linkWithoutParameters;
    this.message = message;
    this.segments = segments;
    this.threadChannelName = getTruncatedString(`📲 ${title}`, 100);
    this.title = title;
  }
}