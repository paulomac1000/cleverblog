type Props = {
  label: string
  value: number
  href: string
}

export const WorkloadCard = ({ label, value, href }: Props) => {
  return (
    <div className="cb-workload-card">
      <span className="cb-workload-card__value">{value}</span>
      <a className="cb-workload-card__link" href={href}>
        {label}
      </a>
    </div>
  )
}

export default WorkloadCard
