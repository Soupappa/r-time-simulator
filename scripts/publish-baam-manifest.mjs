import { copyFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const destination = path.resolve(process.cwd(), 'public', '.well-known')

mkdirSync(destination, { recursive: true })
copyFileSync(
  path.resolve(process.cwd(), 'baam.json'),
  path.join(destination, 'baam.json'),
)
