// Lab gate for the web vitals of plan section 8 (field targets p75: LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1).
// INP is a field metric; in the lab Total Blocking Time is its proxy, held to 200 ms.
// The app is served with the stub BFF so the gate needs no backend (ADR 0005).
const port = 3200;
const desktop = process.env.LHCI_FORM_FACTOR === "desktop";

module.exports = {
  ci: {
    collect: {
      startServerCommand: `STOREFRONT_STUB=1 PORT=${port} node server/index.ts`,
      startServerReadyPattern: "listening on",
      url: [
        `http://127.0.0.1:${port}/`,
        `http://127.0.0.1:${port}/search?q=mug`,
        `http://127.0.0.1:${port}/products/item-kettle`,
        `http://127.0.0.1:${port}/cart`,
      ],
      numberOfRuns: 3,
      settings: {
        onlyCategories: ["performance"],
        chromeFlags: "--no-sandbox --headless=new",
        ...(desktop ? { preset: "desktop" } : {}),
      },
    },
    assert: {
      assertions: {
        "largest-contentful-paint": ["error", { maxNumericValue: 2500, aggregationMethod: "median-run" }],
        "total-blocking-time": ["error", { maxNumericValue: 200, aggregationMethod: "median-run" }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1, aggregationMethod: "median-run" }],
      },
    },
    upload: { target: "filesystem", outputDir: `.lighthouseci/${desktop ? "desktop" : "mobile"}` },
  },
};
