// 팀 정보 미리 세팅 (예시)
const teams = [
  { teamName: "C203", group: "1", played: 0, points: 0 },
  { teamName: "C204", group: "1", played: 0, points: 0 },
  { teamName: "C304", group: "1", played: 0, points: 0 },
  { teamName: "C305", group: "1", played: 1, points: 0 },
  { teamName: "C307", group: "1", played: 1, points: 3 },

  { teamName: "C102", group: "2", played: 1, points: 3 },
  { teamName: "C103", group: "2", played: 0, points: 0 },
  { teamName: "C104", group: "2", played: 0, points: 0 },
  { teamName: "C205", group: "2", played: 0, points: 0 },
  { teamName: "C302", group: "2", played: 1, points: 0 },

  { teamName: "C101", group: "3", played: 0, points: 0 },
  { teamName: "C105", group: "3", played: 0, points: 0 },
  { teamName: "C201", group: "3", played: 0, points: 0 },
  { teamName: "C206", group: "3", played: 0, points: 0 },
  { teamName: "C306", group: "3", played: 0, points: 0 },

  { teamName: "C106", group: "4", played: 0, points: 0 },
  { teamName: "C202", group: "4", played: 0, points: 0 },
  { teamName: "C207", group: "4", played: 0, points: 0 },
  { teamName: "C301", group: "4", played: 0, points: 0 },
  { teamName: "C303", group: "4", played: 0, points: 0 },
];

// 그룹별로 표에 렌더링
function renderGroupTable(group) {
  const groupTeams = teams.filter(team => team.group === group);
  // 승점, 경기수 기준 정렬
  groupTeams.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return b.played - a.played;
  });

  const tbody = document.querySelector(`#groupTable${group} tbody`);
  tbody.innerHTML = '';
  groupTeams.forEach((team, idx) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${idx + 1}</td>
      <td>${team.teamName}</td>
      <td>${team.played}</td>
      <td>${team.points}</td>
    `;
    tbody.appendChild(row);
  });
}

// 각 그룹 표 렌더링
['1', '2', '3', '4'].forEach(renderGroupTable);
