interface StudentNameLinkProps {
  studentId: string | null | undefined;
  name: string | null | undefined;
  code?: string | null | undefined;
  className?: string;
}

export function StudentNameLink({ studentId, name, code, className }: StudentNameLinkProps) {
  const content = (
    <>
      {name}
      {code && (
        <span className="ml-1 text-[11px] font-mono font-normal opacity-60">({code})</span>
      )}
    </>
  );

  if (!studentId) {
    return <span className={className}>{content}</span>;
  }

  return (
    <a
      href={`/customers/${studentId}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`text-blue-600 hover:text-blue-800 hover:underline cursor-pointer font-medium ${className ?? ""}`}
    >
      {content}
    </a>
  );
}
