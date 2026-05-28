import { Client } from 'pg'
import dotenv from 'dotenv'
dotenv.config()

const client = new Client({
  connectionString: process.env.DATABASE_URL
})

async function fix() {
  await client.connect()

  const tables = [
    'branches', 'profiles', 'clients', 'devices',
    'subscription_templates', 'schedule_slots',
    'bookings_v2', 'memberships', 'schedule', 'bookings'
  ]

  for (const table of tables) {
    await client.query(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`)
    console.log(`RLS disabled: ${table}`)
  }

  await client.end()
  console.log('Done')
}

fix().catch(console.error)
