import { print, filesystem, system } from 'gluegun'
import { type as platformType } from 'os'
import { INSTALL_DIR, EXPORTS_FILE_PATH } from './constants'
import upsert from '../patching/upsert'
import { installDeps as installMacDeps } from './pico/mac'
import { installDeps as installLinuxDeps } from './pico/linux'

export default async function (): Promise<void> {
  const OS = platformType().toLowerCase()
  const PICO_SDK_REPO = 'https://github.com/raspberrypi/pico-sdk'
  const PICO_EXAMPLES_REPO = 'https://github.com/raspberrypi/pico-examples'
  const PICO_DIR = filesystem.resolve(INSTALL_DIR, 'pico')
  const PICO_SDK_DIR = filesystem.resolve(PICO_DIR, 'pico-sdk')
  const PICO_EXAMPLES_PATH = filesystem.resolve(PICO_DIR, 'pico-examples')
  const PICO_SDK_BUILD_DIR = filesystem.resolve(PICO_SDK_DIR, 'build')

  const spinner = print.spin()
  spinner.start('Starting pico tooling setup')

  // 0. ensure pico instal directory and Moddable exists
  if (
    process.env.MODDABLE === undefined ||
    filesystem.exists(process.env.MODDABLE) === false
  ) {
    spinner.fail(
      'Moddable platform tooling required. Run `xs-dev setup` before trying again.'
    )
    process.exit(1)
  }
  spinner.info('Ensuring pico directory')
  filesystem.dir(PICO_DIR)

  // 1. Install required components
  if (OS === 'darwin') {
    if (system.which('cmake') === null) {
      spinner.start('Cmake required, installing with Homebrew')
      await system.exec('brew install cmake')
      spinner.succeed()
    }

    spinner.start('Tapping ArmMbed formulae and installing arm-embed-gcc')
    await installMacDeps(spinner)

    const brewPrefix = await system.run('brew --prefix')
    process.env.PICO_GCC_ROOT = brewPrefix
    await upsert(EXPORTS_FILE_PATH, `export PICO_GCC_ROOT=${brewPrefix}`)
  }

  if (OS === 'linux') {
    spinner.start('Installing build dependencies with apt')
    await installLinuxDeps(spinner)
    process.env.PICO_GCC_ROOT = '/usr'
    await upsert(EXPORTS_FILE_PATH, `export PICO_GCC_ROOT=/usr`)
  }
  spinner.succeed()

  // 2. Install the pico sdk and examples:
  if (filesystem.exists(PICO_SDK_DIR) === false) {
    spinner.start('Cloning pico-sdk repo')
    await system.exec(`git clone -b master ${PICO_SDK_REPO} ${PICO_SDK_DIR}`, {
      stdout: process.stdout,
    })
    await system.exec(`git submodule update --init`, {
      cwd: PICO_SDK_DIR,
      stdout: process.stdout,
    })
    spinner.succeed()
  }

  if (filesystem.exists(PICO_EXAMPLES_PATH) === false) {
    spinner.start('Cloning pico-exmples repo')
    await system.exec(
      `git clone -b master ${PICO_EXAMPLES_REPO} ${PICO_EXAMPLES_PATH}`,
      { stdout: process.stdout }
    )
    spinner.succeed()
  }

  // 3. Set the PICO_SDK_PATH environment variable to point to the Pico SDK directory
  if (process.env.PICO_SDK_DIR === undefined) {
    spinner.info('Setting PICO_SDK_DIR')
    process.env.PICO_SDK_DIR = PICO_SDK_DIR
    await upsert(EXPORTS_FILE_PATH, `export PICO_SDK_DIR=${PICO_SDK_DIR}`)
  } else {
    spinner.info(`Using existing $PICO_SDK_DIR: ${process.env.PICO_SDK_DIR}`)
  }

  // 4. Build some pico tools:
  if (
    filesystem.exists(PICO_SDK_BUILD_DIR) === false ||
    filesystem.list(PICO_SDK_BUILD_DIR)?.length === 0
  ) {
    spinner.start('Build some pico tools')
    filesystem.dir(PICO_SDK_BUILD_DIR)
    await system.exec('cmake ..', {
      shell: process.env.SHELL,
      stdout: process.stdout,
      cwd: PICO_SDK_BUILD_DIR,
    })
    await system.exec('make', {
      shell: process.env.SHELL,
      stdout: process.stdout,
      cwd: PICO_SDK_BUILD_DIR,
    })
    spinner.succeed()
  }

  spinner.succeed(`
Successfully set up pico platform support for Moddable!
Test out the setup by starting a new terminal session and putting the device into programming mode by holding the BOOTSEL button when powering on the Pico
Then run: xs-dev run --example helloworld --device pico
  `)
}
