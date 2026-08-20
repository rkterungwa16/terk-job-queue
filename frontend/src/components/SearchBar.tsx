import { useId, type ChangeEvent } from 'react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * `useId` - generates a stable, unique id to correctly associate the
 * `<label>` with the `<input>` for accessibility, without hardcoding an id
 * string that could collide if this component is ever rendered twice on
 * one page.
 *
 * Note this component itself does *not* debounce - it's a plain controlled
 * input that reports every keystroke immediately via `onChange`. Debouncing
 * happens one layer up, in `useFailedJobs` (via `useDebouncedValue`), which
 * is the right place for it: the input should feel instant to type in, and
 * only the *network request* driven by the value needs to be delayed.
 */
export function SearchBar({ value, onChange }: SearchBarProps) {
  const inputId = useId();

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    onChange(event.target.value);
  }

  return (
    <div className="search-bar">
      <label htmlFor={inputId} className="search-bar__label">
        Search failed jobs
      </label>
      <input
        id={inputId}
        type="text"
        className="search-bar__input"
        placeholder="Search by job name or error reason..."
        value={value}
        onChange={handleChange}
      />
    </div>
  );
}
