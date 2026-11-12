import { fieldIsWritable, resolveSchemaFieldKey, type CollectionSchema, type DbRecord, type FieldSpec } from '@biu/type-file-system'
import { FieldValuePop } from '@biu/core-file-system/field-value'

export function HostField({
  name,
  record,
  schema,
  spec: given,
  writable,
  collectionPath = '/pages',
  onSet,
}: {
  name: string
  record: DbRecord
  schema?: CollectionSchema
  spec?: FieldSpec
  writable: boolean
  collectionPath?: string
  onSet: (key: string, value: unknown) => void
}) {
  const key = resolveSchemaFieldKey(schema, name)
  const spec = given ?? schema?.fields?.[key]
  if (!key || !spec) {
    return (
      <div className="page-host-missing" data-testid="page-prop-missing">
        找不到属性 {key}
      </div>
    )
  }
  const canWrite = writable && fieldIsWritable(spec)
  return (
    <div className="page-prop-host-field" data-testid={`page-prop-field-${key}`}>
      <FieldValuePop
        record={record}
        fieldKey={key}
        field={{ ...spec, writable: canWrite }}
        value={record[key]}
        collectionPath={collectionPath}
        onSubmit={(next) => {
          if (!canWrite) return
          onSet(key, next)
        }}
      />
    </div>
  )
}
