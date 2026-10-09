import { createTool } from '@voltagent/core'
import z from 'zod'

export const historianUserListTool = async (data) => {

  const backend_context = data;
  return createTool({
    name: 'historian-user-list',
    description: 'A tool to list all users in the historian database.',
    parameters: z.object({
      // Define any parameters needed for the tool here
    }),
    execute: async () => {
      // Implementation for listing users goes here
      // This is a placeholder for the actual logic
    },
  })
}
