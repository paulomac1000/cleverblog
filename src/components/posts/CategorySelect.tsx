'use client'

type CategoryOption = {
  label: string
  value: string
}

type Props = {
  options: CategoryOption[]
}

export function CategorySelect({ options }: Props) {
  return (
    <select
      aria-describedby="category-filter-hint"
      defaultValue=""
      id="category"
      name="category"
      onChange={(event) => {
        event.currentTarget.form?.requestSubmit()
      }}
    >
      <option value="">Wszystkie kategorie</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
