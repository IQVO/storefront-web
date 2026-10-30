import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup, configure } from "@testing-library/react";

// Route stubs resolve their loaders asynchronously; under a loaded parallel run 1 s is too tight for findBy*.
configure({ asyncUtilTimeout: 4000 });

afterEach(() => {
  cleanup();
  if (typeof localStorage !== "undefined") localStorage.clear();
});
