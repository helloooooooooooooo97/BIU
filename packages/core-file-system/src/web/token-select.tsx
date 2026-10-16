import { CellMulti } from '@biu/database-ui'

export function TokenMultiSelect({
  values,
  options,
  onChange,
  allowCreate = true,
  multiple = true,
  autoOpen = false,
}: {
  values: string[]
  options: Array<string | { value: string; label: string }>
  onChange: (next: string[]) => void
  allowCreate?: boolean
  multiple?: boolean
  autoOpen?: boolean
}) {
  return (
    <CellMulti
      values={values}
      options={options.map((item) => typeof item === 'string' ? { value: item, label: item } : item)}
      onChange={onChange}
      allowCreate={allowCreate}
      multiple={multiple}
      autoOpen={autoOpen}
    />
  )
}
