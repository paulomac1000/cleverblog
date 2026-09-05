'use client'

type CategoryOption = {
  label: string
  value: string
}

type Props = {
  options: CategoryOption[]
  allLabel: string
  ariaLabel?: string
}

export function CategorySelect({ options, allLabel, ariaLabel }: Props) {
  if (options.length === 0) return null

  return (
    <select
      aria-describedby="category-filter-hint"
      aria-label={ariaLabel}
      defaultValue=""
      id="category"
      name="category"
      onChange={(event) => {
        event.currentTarget.form?.requestSubmit()
      }}
    >
      <option value="">{allLabel}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
