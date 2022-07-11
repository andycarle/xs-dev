import { 
  print,
  filesystem, 
  system 
} from 'gluegun'
import {
  INSTALL_PATH,
  INSTALL_DIR,
  MODDABLE_REPO
} from './constants'

import { promisified as regedit, RegistryItemPutCollection, RegistryItemValue } from 'regedit'

export async function setEnv(name: string, value: RegistryItemValue): Promise<void> {
  try {
    const reg: RegistryItemPutCollection = {
      'HKCU\\ENVIRONMENT': {
        [name]: value,
      },
    }
    await regedit.putValue(reg)
  } catch (error) {
    throw new Error('Error while saving environment variable to registry')
  }
}

export async function addToPath(BIN_PATH: string): Promise<string> {
  let result, pathKey, newPath

  try {
    result = await regedit.list([`HKCU\\ENVIRONMENT`])
  } catch (error) {
    throw new Error('Error while reading User Path from registry')
  }

  pathKey = Object.keys(result['HKCU\\ENVIRONMENT'].values).find((key) => key.toUpperCase() === "PATH")

  if (pathKey) {
    const pathEnv = result['HKCU\\ENVIRONMENT'].values[pathKey]
    const tokens = (pathEnv.type === 'REG_EXPAND_SZ' || pathEnv.type == 'REG_SZ') ? String(pathEnv.value).split(';') : [String(pathEnv.value)]
    if (tokens.some((token) => token.toUpperCase() === BIN_PATH.toUpperCase()))
      return 'Moddable BIN already in User PATH.'
    newPath = `${tokens.join(';')};${BIN_PATH}`
  } else {
    pathKey = "PATH"
    newPath = BIN_PATH
  }
  
  await setEnv(pathKey, {
    value: newPath,
    type: 'REG_EXPAND_SZ',
  })
  return 'Moddable BIN now set in PATH.'
}

export default async function (): Promise<void> {
  const BIN_PATH = filesystem.resolve(
    INSTALL_PATH,
    'build',
    'bin',
    'win',
    'release'
  )
  const BUILD_DIR = filesystem.resolve(
    INSTALL_PATH,
    'build',
    'makefiles',
    'win'
  )

  print.info(`Setting up Windows tools at ${INSTALL_PATH}`)

  // Check for Visual Studio CMD tools
    if (system.which('nmake') === null) {
    print.error(
      'Visual Studio 2022 Community is required to build the Moddable SDK: https://www.visualstudio.com/downloads/'
    )
    // @@TODO: need to check if perhaps VS.bat has not been run...
    process.exit(1)
  }
  if (system.which('git') === null) {
    print.error(
      'git is required to clone the Moddable SDK: https://git-scm.com/download/win'
    )
    process.exit(1)
  }

  const spinner = print.spin()
  spinner.start('Beginning setup...')

  // 1. clone moddable repo into INSTALL_DIR directory if it does not exist yet
  try {
    filesystem.dir(INSTALL_DIR)
  } catch (error) {
    spinner.fail(`Error setting up install directory: ${String(error)}`)
    process.exit(1)
  }

  if (filesystem.exists(INSTALL_PATH) !== false) {
    spinner.info('Moddable repo already installed')
  } else {
    try {
      spinner.start('Cloning Moddable-OpenSource/moddable repo')
      await system.spawn(`git clone ${MODDABLE_REPO} ${INSTALL_PATH}`)
      spinner.succeed()
    } catch (error) {
      spinner.fail(`Error cloning moddable repo: ${String(error)}`)
      process.exit(1)
    }
  }

  // 2. configure MODDABLE env variable, add release binaries dir to PATH
  
  spinner.start(`Adding Moddable SDK to User Environment`)
  try {
    await setEnv('MODDABLE', {
      value: INSTALL_PATH,
      type: 'REG_SZ',
    })
    spinner.succeed()
  } catch (error) {
    spinner.fail(error.toString())
  }
  process.env.MODDABLE = INSTALL_PATH

  spinner.start(`Adding Moddable SDK to User Path`)
  try {
    const result = await addToPath(BIN_PATH)
    spinner.info(result)
    spinner.succeed()
  } catch (error) {
    spinner.fail(error.toString())
  }
  process.env.PATH = `${String(process.env.PATH)};${BIN_PATH}`
  
  // 3. build tools
  try {
    spinner.start(`Building Moddable SDK tools: `)
    await system.exec(`build.bat`, { cwd: BUILD_DIR, stdout: process.stdout})
    spinner.succeed()
  } catch (error) {
    spinner.fail(`Error building Moddable SDK tools: ${String(error)}`)
    process.exit(1)
  }

  spinner.succeed("Moddable SDK successfully set up!")
  print.info(`Start a new terminal session and run the "helloworld example": xs-dev run --example helloworld'`)
}
