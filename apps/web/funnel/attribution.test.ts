import { describe, expect, it } from "vitest";
import { readAttribution } from "./attribution";

const OWN_HOSTS = ["app.speakup.example", "speakup.example"];

describe("readAttribution", () => {
  it("reads utm_* and the referrer host only", () => {
    expect(
      readAttribution(
        "?utm_source=google&utm_medium=cpc&utm_campaign=spring&utm_content=ad-1&utm_term=public%20speaking&gclid=abc&email=a%40b.c",
        "https://www.Google.com/search?q=my+name",
        OWN_HOSTS,
      ),
    ).toEqual({
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "spring",
      utmContent: "ad-1",
      utmTerm: "public speaking",
      referrerHost: "www.google.com",
    });
  });

  it("returns null when there is nothing to attribute", () => {
    expect(readAttribution("", "", OWN_HOSTS)).toBeNull();
    expect(readAttribution("?step=1", "", OWN_HOSTS)).toBeNull();
  });

  it("drops empty or blank UTM values", () => {
    expect(readAttribution("?utm_source=&utm_medium=%20%20&utm_campaign=x", "", OWN_HOSTS)).toEqual(
      { utmCampaign: "x" },
    );
  });

  it("truncates long values and ignores the app's own host", () => {
    const long = "a".repeat(300);
    expect(
      readAttribution(`?utm_source=${long}`, "https://APP.speakup.example:443/start", OWN_HOSTS),
    ).toEqual({ utmSource: "a".repeat(200) });
    expect(readAttribution("", "https://speakup.example/", OWN_HOSTS)).toBeNull();
  });

  it("omits an invalid referrer", () => {
    expect(readAttribution("", "not a url", OWN_HOSTS)).toBeNull();
    expect(readAttribution("", "https://[::1]/", OWN_HOSTS)).toBeNull();
  });
});
