import { getTruncatedString } from "../helpers/utilities.js";

export default class CachedLinkData {
  constructor({
    authorName,
    endTime,
    formattedAuthorName,
    formattedTitle,
    id,
    link,
    linkWithoutParameters,
    messageId,
    segments,
    title
   }) {
    this.authorName = authorName;
    this.endTime = endTime;
    this.formattedAuthorName = formattedAuthorName;
    this.formattedTitle = formattedTitle;
    this.id = id;
    this.link = link;
    this.linkWithoutParameters = linkWithoutParameters;
    this.messageId = messageId;
    this.segments = segments;
    this.threadChannelName = getTruncatedString(`📲 ${title}`, 100);
    this.title = title;
  }
}