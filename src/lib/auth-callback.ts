const initialHash = new URLSearchParams(window.location.hash.slice(1));
const initialSearch = new URLSearchParams(window.location.search);

export const startedFromPasswordRecovery =
  initialHash.get("type") === "recovery" ||
  initialSearch.get("type") === "recovery";

export const initialAuthErrorCode =
  initialHash.get("error_code") || initialSearch.get("error_code");
