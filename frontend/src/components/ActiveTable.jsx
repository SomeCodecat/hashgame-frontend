import React from "react";

function mkCell(v) {
  if (v == null) return "";
  return String(v);
}

export default function ActiveTable({ rows }) {
  if (!rows || rows.length === 0) return <em>no rows</em>;
  const header = rows[0].cells || [];
  const data = rows.slice(1).map((r) => r.cells || []);
  return (
    <table className="table">
      <thead>
        <tr>
          {header.map((h, i) => (
            <th key={i}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((cells, ri) => (
          <tr key={ri}>
            {header.map((_, ci) => (
              <td key={ci}>{mkCell(cells[ci])}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
