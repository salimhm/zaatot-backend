import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'

import { service_tenant } from '@module/main/tenant/tenant.service'

const mock_db = {
  insert: mock(() => ({
    values: mock(() => ({
      returning: mock(() => Promise.resolve([{ organization_id: 1, organization_name: 'Acme', user_id: 1 }])),
    })),
  })),
  select: mock(
    (..._args: any[]) =>
      ({
        from: mock((..._args: any[]) => ({
          where: mock(
            (..._args: any[]) => Promise.resolve([{ count: 0, organization_schema_version: '0.0.0', organization_db_url: 'db-url' }]) as Promise<any>,
          ),
          innerJoin: mock((..._args: any[]) => ({
            where: mock((..._args: any[]) => Promise.resolve([{ organization_id: 1, organization_schema_version: '0.0.1' }]) as Promise<any>),
          })),
        })),
      }) as any,
  ),
  update: mock(() => ({
    set: mock(() => ({
      where: mock(() => ({
        returning: mock(() => Promise.resolve([{ organization_id: 1, organization_name: 'Acme', user_id: 1 }])),
      })),
      returning: mock(() => Promise.resolve([{ organization_id: 1, organization_name: 'Acme', user_id: 1 }])),
    })),
  })),
  delete: mock(() => ({
    where: mock(() => Promise.resolve()),
  })),
}

mock.module('@db/client.db', () => ({
  db_client: mock(() => mock_db),
}))

mock.module('@db/main.schema.db', () => ({
  table_organization: {},
  table_organization_user: {},
}))

mock.module('@db/utils.db', () => ({
  select: mock(() =>
    Promise.resolve({
      rows: null,
      pages: null,
      page: 1,
      take: 12,
      data: [{ organization_id: 1, organization_name: 'Acme', user_id: 1 }],
    }),
  ),
}))

let spy_provision: any
beforeEach(() => {
  spy_provision = spyOn(service_tenant, 'provision_tenant_db').mockImplementation(() => Promise.resolve())
})

afterEach(() => {
  spy_provision.mockRestore()
})

const { service_organization } = await import('@module/main/organization/organization.service')

describe('Organization Service', () => {
  it('should find organizations successfully', async () => {
    const result = await service_organization.find(
      {
        columns: ['organization_id', 'organization_name'],
        take: 12,
      },
      { user_id: 1 },
    )

    expect(result.data).toBeDefined()
    expect(result.data[0]?.organization_id).toBe(1)
  })

  it('should create an organization successfully', async () => {
    const body = {
      organization_name: 'Acme',
    }
    const payload = {
      user_id: 1,
    }

    const result = await service_organization.create(body, payload)

    expect(result.data).toBeDefined()
    expect(result.data.organization_name).toBe('Acme')
    expect(spy_provision).toHaveBeenCalled()
  })

  it('should throw user-max-organizations when limit is reached', async () => {
    mock_db.select.mockImplementationOnce(() => ({
      from: mock(() => ({
        where: mock(() => Promise.resolve([{ count: 12, organization_schema_version: '0.0.0', organization_db_id: 'db-id' }])),
      })),
    }))

    try {
      await service_organization.create({ organization_name: 'Over Limit' }, { user_id: 1 })
      expect(true).toBe(false)
    } catch (error: unknown) {
      const err = error as { code?: string }
      expect(err.code).toBe('user-max-organizations')
    }
  })

  it('should update an organization successfully', async () => {
    const body = {
      organization_id: 1,
      organization_name: 'Acme Updated',
    }
    const payload = {
      user_id: 1,
    }

    const result = await service_organization.update(body, payload)

    expect(result.data).toBeDefined()
    expect(result.data.organization_name).toBe('Acme')
  })

  it('should delete an organization successfully', async () => {
    const body = {
      organization_id: 1,
    }
    const payload = {
      user_id: 1,
    }

    const result = await service_organization.delete(body, payload)

    expect(result.data).toBeDefined()
    expect(result.data.organization_id).toBe(1)
  })

  it('should throw organization-provision-failed if database provisioning fails', async () => {
    spy_provision.mockImplementationOnce(() => Promise.reject(new Error('Provision failed')))

    const body = {
      organization_name: 'Failed Org',
    }
    const payload = {
      user_id: 1,
    }

    try {
      await service_organization.create(body, payload)
      expect(true).toBe(false)
    } catch (error: unknown) {
      const err = error as { code?: string }
      expect(err.code).toBe('organization-provision-failed')
    }
  })
})
