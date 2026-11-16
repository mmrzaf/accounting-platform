/** Branded identifiers prevent accidental assignment across security boundaries. */
export type Brand<Value, Tag extends string> = Value & { readonly __brand: Tag }
export type OrganizationId = Brand<string, 'OrganizationId'>
export type CompanyId = Brand<string, 'CompanyId'>
export type UserId = Brand<string, 'UserId'>

/** An authenticated actor has an organization scope; company scope is explicit per use case. */
export interface ActorScope {
  readonly organizationId: OrganizationId
  readonly userId: UserId
}

export interface CompanyScope {
  readonly organizationId: OrganizationId
  readonly companyId: CompanyId
}

/** A boundary must validate and construct identifiers; do not cast untrusted input. */
export function parseIdentifier<Tag extends string>(raw: unknown): Brand<string, Tag> {
  if (typeof raw !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(raw)) {
    throw new Error('Invalid identifier')
  }
  return raw as Brand<string, Tag>
}
