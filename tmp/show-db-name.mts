import dotenv from 'dotenv'
import mongoose from 'mongoose'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

dotenv.config({ path: '/home/dkeehner/projects/new-full/backend/.env.local' })

await getPayload({ config })
console.log(JSON.stringify({ databaseName: mongoose.connection?.db?.databaseName || null, host: mongoose.connection?.host || null, name: mongoose.connection?.name || null }, null, 2))
