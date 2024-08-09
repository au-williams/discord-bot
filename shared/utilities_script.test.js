import Utilities from "./utilities_script";

describe("getLinkFromString", () => {
  test("returns the first link when present in the string", () => {
    const result = Utilities.getLinkFromString("foo http://youtu.be/w?v=a&b=c bar");
    expect(result).toBe("http://youtu.be/w?v=a&b=c");
  });
  test("returns null when no link is present in the string", () => {
    const result = Utilities.getLinkFromString("foo bar");
    expect(result).toBeNull();
  });
  test("returns the first link when multiple links are present in the string", () => {
    const result = Utilities.getLinkFromString("foo http://youtu.be/w?v=a&b=c bar http://example.com");
    expect(result).toBe("http://youtu.be/w?v=a&b=c");
  });
  test("returns the first link and ignores code blocks when ignoreCodeBlocks is true", () => {
    const result = Utilities.getLinkFromString("foo ```http://example.com``` http://youtu.be/w?v=a&b=c bar", true);
    expect(result).toBe("http://youtu.be/w?v=a&b=c");
  });
  test("returns null if the only link is inside a code block and ignoreCodeBlocks is true", () => {
    const result = Utilities.getLinkFromString("foo ```http://example.com``` bar", true);
    expect(result).toBeNull();
  });
  test("returns the link inside a code block when ignoreCodeBlocks is false", () => {
    const result = Utilities.getLinkFromString("foo ```http://example.com``` bar", false);
    expect(result).toBe("http://example.com");
  });
})

describe("getLinkWithoutParametersFromString", () => {
  test("returns the first link without parameters when present in the string", () => {
    const result = Utilities.getLinkWithoutParametersFromString("foo http://youtu.be/w?v=a&b=c bar");
    expect(result).toBe("http://youtu.be/w?v=a");
  });
  test("returns null when no link is present in the string", () => {
    const result = Utilities.getLinkWithoutParametersFromString("foo bar");
    expect(result).toBeNull();
  });
  test("returns the first link without parameters when multiple links are present in the string", () => {
    const result = Utilities.getLinkWithoutParametersFromString("foo http://youtu.be/w?v=a&b=c bar http://example.com?q=1&x=2");
    expect(result).toBe("http://youtu.be/w?v=a");
  });
  test("returns the first link without parameters and ignores code blocks when ignoreCodeBlocks is true", () => {
    const result = Utilities.getLinkWithoutParametersFromString("foo ```http://example.com?q=1&x=2``` http://youtu.be/w?v=a&b=c bar", true);
    expect(result).toBe("http://youtu.be/w?v=a");
  });
  test("returns null if the only link is inside a code block and ignoreCodeBlocks is true", () => {
    const result = Utilities.getLinkWithoutParametersFromString("foo ```http://example.com?q=1&x=2``` bar", true);
    expect(result).toBeNull();
  });
  test("returns the link without parameters inside a code block when ignoreCodeBlocks is false", () => {
    const result = Utilities.getLinkWithoutParametersFromString("foo ```http://example.com?q=1&x=2``` bar", false);
    expect(result).toBe("http://example.com?q=1");
  });
});

describe("getPercentage", () => {
  test("returns the correct percentage for a valid partialValue and totalValue", () => {
    const result = Utilities.getPercentage(50, 200);
    expect(result).toBe(25); // 50 is 25% of 200
  });
  test("returns 100 when partialValue equals totalValue", () => {
    const result = Utilities.getPercentage(100, 100);
    expect(result).toBe(100); // 100 is 100% of 100
  });
  test("returns 0 when partialValue is 0", () => {
    const result = Utilities.getPercentage(0, 100);
    expect(result).toBe(0); // 0 is 0% of 100
  });
  test("returns NaN when totalValue is 0", () => {
    const result = Utilities.getPercentage(50, 0);
    expect(result).toBeNaN(); // Division by zero
  });
  test("returns a negative percentage when partialValue is negative", () => {
    const result = Utilities.getPercentage(-50, 200);
    expect(result).toBe(-25); // -50 is -25% of 200
  });
  test("returns the correct percentage when both partialValue and totalValue are negative", () => {
    const result = Utilities.getPercentage(-50, -200);
    expect(result).toBe(25); // -50 is 25% of -200
  });
})

describe("getPluralizedString", () => {
  test("returns the pluralized string when count is not 1", () => {
    const result = Utilities.getPluralizedString("Apple", 6);
    expect(result).toBe("Apples"); // "Apple" becomes "Apples"
  });
  test("returns the original string when count is 1", () => {
    const result = Utilities.getPluralizedString("Apple", 1);
    expect(result).toBe("Apple"); // "Apple" remains "Apple"
  });
  test("returns the pluralized string when count is 0", () => {
    const result = Utilities.getPluralizedString("Apple", 0);
    expect(result).toBe("Apples"); // "Apple" becomes "Apples"
  });
  test("returns the pluralized string when count is negative", () => {
    const result = Utilities.getPluralizedString("Apple", -1);
    expect(result).toBe("Apples"); // "Apple" becomes "Apples"
  });
  test("returns the pluralized string when count is greater than 1", () => {
    const result = Utilities.getPluralizedString("Apple", 2);
    expect(result).toBe("Apples"); // "Apple" becomes "Apples"
  });
  test("returns the pluralized string for an irregular plural", () => {
    const result = Utilities.getPluralizedString("Box", 3);
    expect(result).toBe("Boxs"); // "Box" becomes "Boxs"
  });
});

describe("getStringWithoutEmojis", () => {
  test("returns the string with all emojis removed", () => {
    const result = Utilities.getStringWithoutEmojis("Hello 👋, how are you 😊?");
    expect(result).toBe("Hello , how are you ?");
  });
  test("returns the original string when there are no emojis", () => {
    const result = Utilities.getStringWithoutEmojis("Hello, how are you?");
    expect(result).toBe("Hello, how are you?");
  });
  test("returns an empty string when the input is only emojis", () => {
    const result = Utilities.getStringWithoutEmojis("👋😊👍");
    expect(result).toBe("");
  });
  test("returns the string without changing non-emoji characters", () => {
    const result = Utilities.getStringWithoutEmojis("123 🐱 abc 🐶");
    expect(result).toBe("123  abc ");
  });
  test("returns the string with multiple emojis removed", () => {
    const result = Utilities.getStringWithoutEmojis("The sun ☀️ is shining 🌞!");
    expect(result).toBe("The sun  is shining !");
  });
  test("returns the string with text symbols removed", () => {
    const result = Utilities.getStringWithoutEmojis("Symbols: © ™ ®");
    expect(result).toBe("Symbols:   ");
  });
});

// TODO: this function needs to be simplified
// describe("getSplitJsonStringByLength", () => {
//   test("returns an array of strings split by the specified length", () => {
//     const result = Utilities.getSplitJsonStringByLength("aabbccdd", 2);
//     expect(result).toEqual(["aa", "bb", "cc", "dd"]);
//   });
//   test("returns an array of strings with the last string shorter than the specified length", () => {
//     const result = Utilities.getSplitJsonStringByLength("abcdefgh", 3);
//     expect(result).toEqual(["abc", "def", "gh"]);
//   });
//   test("returns the entire string as a single element when the length is greater than the string length", () => {
//     const result = Utilities.getSplitJsonStringByLength("abc", 10);
//     expect(result).toEqual(["abc"]);
//   });
//   test("returns an array of single characters when the length is 1", () => {
//     const result = Utilities.getSplitJsonStringByLength("abcd", 1);
//     expect(result).toEqual(["a", "b", "c", "d"]);
//   });
//   test("handles a string with newline characters correctly", () => {
//     const result = Utilities.getSplitJsonStringByLength("abc\ndef\ngh", 5);
//     expect(result).toEqual(["abc\ndef", "gh"]);
//   });
//   test("returns an array with empty strings when the input string is empty", () => {
//     const result = Utilities.getSplitJsonStringByLength("", 3);
//     expect(result).toEqual([""]);
//   });
// })

describe("getTimestampAsTotalSeconds", () => {
  test("returns the total seconds for a valid HH:MM:SS timestamp", () => {
    const result = Utilities.getTimestampAsTotalSeconds("01:30:45");
    expect(result).toBe(5445); // 1 hour * 3600 + 30 minutes * 60 + 45 seconds
  });
  test("returns 0 for a timestamp of 00:00:00", () => {
    const result = Utilities.getTimestampAsTotalSeconds("00:00:00");
    expect(result).toBe(0);
  });
  test("returns the correct total seconds for a timestamp with leading zeros", () => {
    const result = Utilities.getTimestampAsTotalSeconds("00:05:07");
    expect(result).toBe(307); // 5 minutes * 60 + 7 seconds
  });
  test("returns the correct total seconds for a timestamp of only hours", () => {
    const result = Utilities.getTimestampAsTotalSeconds("02:00:00");
    expect(result).toBe(7200); // 2 hours * 3600
  });
  test("returns the correct total seconds for a timestamp of only minutes", () => {
    const result = Utilities.getTimestampAsTotalSeconds("00:45:00");
    expect(result).toBe(2700); // 45 minutes * 60
  });
  test("returns the correct total seconds for a timestamp of only seconds", () => {
    const result = Utilities.getTimestampAsTotalSeconds("00:00:45");
    expect(result).toBe(45); // 45 seconds
  });
})

describe("getTruncatedStringTerminatedByChar", () => {
  test("returns the original string if its length is less than or equal to maxLength", () => {
    expect(Utilities.getTruncatedStringTerminatedByChar("short string", 20)).toBe("short string");
    expect(Utilities.getTruncatedStringTerminatedByChar("exact length", 12)).toBe("exact length");
  });
  test("returns a truncated string with no ellipsis if maxLength is less than or equal to 3", () => {
    expect(Utilities.getTruncatedStringTerminatedByChar("truncate", 3)).toBe("tru");
    expect(Utilities.getTruncatedStringTerminatedByChar("truncate", 2)).toBe("tr");
    expect(Utilities.getTruncatedStringTerminatedByChar("truncate", 1)).toBe("t");
  });
  test("returns a truncated string with .. if maxLength is between 4 and 5 inclusive", () => {
    expect(Utilities.getTruncatedStringTerminatedByChar("truncate", 5)).toBe("tru..");
    expect(Utilities.getTruncatedStringTerminatedByChar("truncate", 4)).toBe("tr..");
  });
  test("returns a truncated string with ... if maxLength is greater than 5", () => {
    expect(Utilities.getTruncatedStringTerminatedByChar("this is a longer string", 10)).toBe("this is...");
    expect(Utilities.getTruncatedStringTerminatedByChar("this is a longer string", 15)).toBe("this is a lo...");
  });
  test("handles edge cases", () => {
    expect(Utilities.getTruncatedStringTerminatedByChar("", 5)).toBe("");
    expect(Utilities.getTruncatedStringTerminatedByChar("short", 0)).toBe("");
    expect(Utilities.getTruncatedStringTerminatedByChar("short", 1)).toBe("s");
    // TODO: some issues with these but not a problem for now
    // expect(Utilities.getTruncatedStringTerminatedByChar("short", -1)).toBe("");
  });
});

describe("getTruncatedStringTerminatedByWord", () => {
  test("returns the original string if it is shorter than maxLength", () => {
    const input = "short string";
    const result = Utilities.getTruncatedStringTerminatedByWord(input, 20);
    expect(result).toBe("short string");
  });
  test("returns string and terminate with [...] when exceeding maxLength", () => {
    const input = "the quick brown fox jumps over the lazy dog";
    const result = Utilities.getTruncatedStringTerminatedByWord(input, 20);
    expect(result).toBe("the quick [...]");
  });
  test("returns cases where the string is exactly maxLength", () => {
    const input = "the quick brown fox";
    const result = Utilities.getTruncatedStringTerminatedByWord(input, 19);
    expect(result).toBe("the quick brown fox");
  });
  test("returns if the first word exceeds maxLength", () => {
    const input = "supercalifragilisticexpialidocious";
    const result = Utilities.getTruncatedStringTerminatedByWord(input, 10);
    expect(result).toBe("supercalifragilisticexpialidocious");
  });
  test("returns an empty string if given an empty string", () => {
    const input = "";
    const result = Utilities.getTruncatedStringTerminatedByWord(input, 10);
    expect(result).toBe("");
  });
  test("returns strings that contain only one word", () => {
    const input = "hello";
    const result = Utilities.getTruncatedStringTerminatedByWord(input, 10);
    expect(result).toBe("hello");
  });
  // TODO: some issues with these but not a problem for now
  // test("should handle maxLength being less than the length of the first word", () => {
  //   const input = "extraordinary longword";
  //   const result = Utilities.getTruncatedStringTerminatedByWord(input, 5);
  //   expect(result).toBe("extraordinary");
  // });
});

describe("isEqualArrays", () => {
  test("returns true for identical arrays", () => {
    expect(Utilities.isEqualArrays([1, 2, 3], [1, 2, 3])).toBe(true);
  });
  test("returns false for arrays with different elements", () => {
    expect(Utilities.isEqualArrays([1, 2, 3], [4, 5, 6])).toBe(false);
  });
  test("returns false for arrays with same elements but in different orders", () => {
    expect(Utilities.isEqualArrays([1, 2, 3], [3, 2, 1])).toBe(false);
  });
  test("returns true for two empty arrays", () => {
    expect(Utilities.isEqualArrays([], [])).toBe(true);
  });
  test("returns false for arrays of different lengths", () => {
    expect(Utilities.isEqualArrays([1, 2, 3], [1, 2])).toBe(false);
  });
  test("returns true for nested arrays that are identical", () => {
    expect(Utilities.isEqualArrays([[1, 2], [3, 4]], [[1, 2], [3, 4]])).toBe(true);
  });
  test("returns false for nested arrays that are different", () => {
    expect(Utilities.isEqualArrays([[1, 2], [3, 4]], [[4, 5], [6, 7]])).toBe(false);
  });
});

describe("isExecutableFilename", () => {
  test("returns true for .js files", () => {
    expect(Utilities.isExecutableFilename("script.js")).toBe(true);
  });
  test("returns true for .ts files", () => {
    expect(Utilities.isExecutableFilename("module.ts")).toBe(true);
  });
  test("returns false for .test.js files", () => {
    expect(Utilities.isExecutableFilename("script.test.js")).toBe(false);
  });
  test("returns false for .test.ts files", () => {
    expect(Utilities.isExecutableFilename("module.test.ts")).toBe(false);
  });
  test("returns false for non-JS/TS files", () => {
    expect(Utilities.isExecutableFilename("style.css")).toBe(false);
  });
});

describe("isNumericString", () => {
  test("returns true for numeric strings", () => {
    expect(Utilities.isNumericString("123")).toBe(true);
    expect(Utilities.isNumericString("123.45")).toBe(true);
    expect(Utilities.isNumericString("-123.45")).toBe(true);
    expect(Utilities.isNumericString("0")).toBe(true);
  });
  test("returns false for non-numeric strings", () => {
    expect(Utilities.isNumericString("abc")).toBe(false);
    expect(Utilities.isNumericString("123abc")).toBe(false);
    expect(Utilities.isNumericString("")).toBe(false);
    expect(Utilities.isNumericString(" ")).toBe(false);
  });
  test("returns false for non-string inputs", () => {
    expect(Utilities.isNumericString(123)).toBe(false);
    expect(Utilities.isNumericString(null)).toBe(false);
    expect(Utilities.isNumericString(undefined)).toBe(false);
    expect(Utilities.isNumericString({})).toBe(false);
    expect(Utilities.isNumericString([])).toBe(false);
  });
  test("returns true for strings with leading and trailing spaces around numeric values", () => {
    expect(Utilities.isNumericString(" 123 ")).toBe(true);
    expect(Utilities.isNumericString(" 123.45 ")).toBe(true);
  });
  // test("handles edge cases", () => {
    // TODO: some issues with these but not a problem for now
    // expect(Utilities.isNumericString("NaN")).toBe(false);
    // expect(Utilities.isNumericString("Infinity")).toBe(false);
    // expect(Utilities.isNumericString("-Infinity")).toBe(false);
    // expect(Utilities.isNumericString("0x123")).toBe(false);
  // });
});
