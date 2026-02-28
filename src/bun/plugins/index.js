import {join} from 'path'
import cssAliases from './cssAliases.js'
import cssGlobs from './cssGlobs.js'
import jsGlobs from './jsGlobs.js'

const builtins = {cssAliases, cssGlobs, jsGlobs}
const TYPE_REGEXES = {
  css: /\.css$/,
  js: /\.(js|ts|jsx|tsx)$/
}

// Combines transform functions into a single Bun plugin for a given file type.
function transformPipeline(type, transforms) {
  const filter = TYPE_REGEXES[type]

  return {
    name: `${type}-transforms`,
    setup(build) {
      build.onLoad({filter}, async args => {
        let content = await Bun.file(args.path).text()
        for (const transform of transforms)
          content = await transform(content, args)
        return {contents: content, loader: type}
      })
    }
  }
}

// Resolves plugin config into Bun plugin instances.
export async function resolvePlugins(pluginConfig, context) {
  const bunPlugins = []
  const generators = []

  if (!pluginConfig || typeof pluginConfig !== 'object')
    return {plugins: bunPlugins, generators}

  for (const [type, names] of Object.entries(pluginConfig)) {
    if (!Array.isArray(names)) continue

    if (type === 'generate') {
      for (const name of names) {
        const result = await loadPlugin(name, context)
        if (result?.run) generators.push(result)
        else if (result != null)
          console.error(` ✖ Generator "${name}" must return { run() }`)
      }
      continue
    }

    if (TYPE_REGEXES[type]) {
      const transforms = []

      for (const name of names) {
        const result = await loadPlugin(name, context)
        if (typeof result === 'function') transforms.push(result)
        else if (result?.setup) bunPlugins.push(result)
        else if (result != null)
          console.error(` ✖ Plugin "${name}" returned an invalid value`)
      }

      if (transforms.length)
        bunPlugins.unshift(transformPipeline(type, transforms))
      continue
    }

    console.error(` ✖ Unknown plugin type "${type}"`)
  }

  return {plugins: bunPlugins, generators}
}

// Loads and evaluates usability of a plugin.
async function loadPlugin(name, context) {
  let factory = builtins[name]

  if (!factory) {
    try {
      const mod = await import(join(context.root, name))
      factory = mod.default || mod
      if (typeof factory === 'function')
        console.log(` ▸ Loaded custom plugin: ${name}`)
    } catch (err) {
      console.error(` ✖ Failed to load plugin "${name}": ${err.message}`)
      return null
    }
  }

  if (typeof factory !== 'function') {
    console.error(` ✖ Plugin "${name}" does not export a function`)
    return null
  }

  return factory(context)
}
