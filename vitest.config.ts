import { defineProject, mergeConfig } from "vitest/config";
import shared from "./vitest.shared";

export default mergeConfig(
  shared,
  defineProject({
    test: {
      // This file is the root config, so we need to define the projects to run.
      // The glob pattern will find all vitest.config.ts files in the packages and apps.
      // See: https://vitest.dev/config/#projects
      projects: ["packages/*/vitest.config.ts", "apps/*/vitest.config.ts"],
    },
  })
);
