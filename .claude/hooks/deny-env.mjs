/**
 * Blocks Bash commands that reach for an env file.
 *
 * `permissions.deny` only covers the Read tool, and this repo's agent guidance has the
 * model reading files through Bash — so `Read(./.env.local)` leaves `cat .env.local`
 * wide open. This closes the everyday version of that: a command string that names an
 * env file is refused before it runs.
 *
 * It matches text, so it is a guard against accident, not against a determined bypass.
 * `.env.example` is allowed — it is committed and holds no values.
 */
let input = ''
process.stdin.on('data', (chunk) => (input += chunk))
process.stdin.on('end', () => {
  let command = ''
  try {
    command = JSON.parse(input)?.tool_input?.command ?? ''
  } catch {
    process.exit(0)
  }

  const hit = command.match(/(^|[\s'"`/\=(])\.env(?!\.example\b)[\w.-]*/)
  if (hit) {
    console.error(
      `Blocked: this command names ${hit[0].trim()}. Env files hold live keys and are ` +
      `denied to the agent. Ask the user for the value, or read .env.example instead.`
    )
    process.exit(2)
  }
  process.exit(0)
})
