import path from "path"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { NpmConfig } from "@opencode-ai/core/npm-config"
import { tmpdir } from "./fixture/tmpdir"

const withEnv = async (env: Record<string, string | undefined>, action: () => Promise<void>) => {
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]))
  Object.entries(env).forEach(([key, value]) => {
    if (value === undefined) {
      delete process.env[key]
      return
    }
    process.env[key] = value
  })
  await action().finally(() =>
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key]
        return
      }
      process.env[key] = value
    }),
  )
}

describe("NpmConfig.load", () => {
  test("reads registry from project .npmrc", async () => {
    await using tmp = await tmpdir()
    await Bun.write(path.join(tmp.path, ".npmrc"), "registry=https://registry.example.test/\n")

    const config = await Effect.runPromise(NpmConfig.load(tmp.path))

    expect(config.registry).toBe("https://registry.example.test/")
  })

  test("reads scoped registries from project .npmrc", async () => {
    await using tmp = await tmpdir()
    await Bun.write(path.join(tmp.path, ".npmrc"), "@acme:registry=https://npm.acme.test/\n")

    const config = await Effect.runPromise(NpmConfig.load(tmp.path))

    expect(config["@acme:registry"]).toBe("https://npm.acme.test/")
  })

  test("flattens boolean and list options", async () => {
    await using tmp = await tmpdir()
    await Bun.write(path.join(tmp.path, ".npmrc"), "ignore-scripts=true\nomit[]=dev\nomit[]=optional\n")

    const config = await Effect.runPromise(NpmConfig.load(tmp.path))

    expect(config.ignoreScripts).toBe(true)
    expect(config.omit).toEqual(["dev", "optional"])
  })

  test("prefers npm_config_registry over project .npmrc", async () => {
    await using tmp = await tmpdir()
    await Bun.write(path.join(tmp.path, ".npmrc"), "registry=https://project.example.test/\n")

    await withEnv(
      {
        npm_config_registry: "https://env.example.test/",
        NPM_CONFIG_REGISTRY: "https://env.example.test/",
        npm_config_userconfig: path.join(tmp.path, "missing-user.npmrc"),
        npm_config_globalconfig: path.join(tmp.path, "missing-global.npmrc"),
      },
      async () => {
        const config = await Effect.runPromise(NpmConfig.load(tmp.path))

        expect(config.registry).toBe("https://env.example.test/")
      },
    )
  })

  test("reads registry from user .npmrc", async () => {
    await using tmp = await tmpdir()
    await using home = await tmpdir()
    await Bun.write(path.join(home.path, ".npmrc"), "registry=https://user.example.test/\n")

    await withEnv(
      {
        npm_config_registry: undefined,
        NPM_CONFIG_REGISTRY: undefined,
        npm_config_userconfig: undefined,
        npm_config_globalconfig: path.join(tmp.path, "missing-global.npmrc"),
        HOME: home.path,
        USERPROFILE: home.path,
      },
      async () => {
        const config = await Effect.runPromise(NpmConfig.load(tmp.path))

        expect(config.registry).toBe("https://user.example.test/")
      },
    )
  })

  test("reads registry from global npmrc", async () => {
    await using tmp = await tmpdir()
    const globalConfig = path.join(tmp.path, "global.npmrc")
    await Bun.write(globalConfig, "registry=https://global.example.test/\n")

    await withEnv(
      {
        npm_config_registry: undefined,
        NPM_CONFIG_REGISTRY: undefined,
        npm_config_userconfig: path.join(tmp.path, "missing-user.npmrc"),
        npm_config_globalconfig: globalConfig,
      },
      async () => {
        const config = await Effect.runPromise(NpmConfig.load(tmp.path))

        expect(config.registry).toBe("https://global.example.test/")
      },
    )
  })
})

describe("NpmConfig.registry", () => {
  test("normalizes configured registry without trailing slash", async () => {
    await using tmp = await tmpdir()
    await Bun.write(path.join(tmp.path, ".npmrc"), "registry=https://registry.example.test/\n")

    await expect(Effect.runPromise(NpmConfig.registry(tmp.path))).resolves.toBe("https://registry.example.test")
  })

  test("leaves configured registry without trailing slash unchanged", async () => {
    await using tmp = await tmpdir()
    await Bun.write(path.join(tmp.path, ".npmrc"), "registry=https://registry.example.test\n")

    await expect(Effect.runPromise(NpmConfig.registry(tmp.path))).resolves.toBe("https://registry.example.test")
  })
})
