# dev scripts

Ad-hoc tools that aren't part of the shipped product. Kept under `docs/dev/`
so they're discoverable but separated from the application source.

## Scripts

- `inspect_xlsx.py` — pretty-prints the column populations of a Testiny `.xlsx`
  export. Useful when sizing up a new import target. Usage:

  ```sh
  pip install openpyxl
  PYTHONIOENCODING=utf-8 python docs/dev/inspect_xlsx.py /path/to/export.xlsx
  ```

- `inspect_xlsx_values.py` — distribution of `Type` / `Priority` values + a
  few full step examples. Used during the importer build to validate the
  type/priority mappings against real data. Same usage pattern.

Neither script depends on the Go service or the database — they read the
xlsx file directly. They take any path as an argument; no customer paths
are baked in.
