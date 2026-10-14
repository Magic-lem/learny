type IconName = 'book' | 'plus' | 'note' | 'arrow' | 'refresh' | 'search' | 'check' | 'branch'
const paths: Record<IconName, string> = {
  book: 'M12 5.5C9 3.5 5 3.5 3 4.5v15c2-1 6-1 9 1 3-2 7-2 9-1v-15c-2-1-6-1-9 1Zm0 0v15',
  plus: 'M12 5v14M5 12h14',
  note: 'M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8M8 16h6',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  refresh: 'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Zm4.5-2 6 6',
  check: 'm5 12 4 4L19 6',
  branch: 'M6 4v10a4 4 0 0 0 4 4h8M6 10h8a4 4 0 0 0 4-4V4M3 4h6M15 4h6M15 18h6',
}
export function Icon({name}: {name: IconName}) {
  return <svg className="learny-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}
