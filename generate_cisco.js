const fs = require('fs');
const { v4: uuidv4 } = require('crypto');

function uuid() {
  return "id_" + Math.random().toString(36).substring(2, 9);
}

// Convert logic to use section-based port IDs
// section "rj45" has ports 1-48, so IDs are "rj45-p1" to "rj45-p48"
// section "sfp" has ports 1-2, so IDs are "sfp-p1" and "sfp-p2"
function getPortId(i) {
  if (i <= 48) {
    return `rj45-p${i}`;
  } else {
    return `sfp-p${i - 48}`;
  }
}

// Port ranges for unit 1
const unit1Ports = {};
for (let i = 1; i <= 50; i++) {
  const id = getPortId(i);
  if (i >= 1 && i <= 5) {
    unit1Ports[id] = { vlan: '100', allowedVlans: ['50'], type: 'trunk', name: 'AP' };
  } else if (i >= 6 && i <= 11) {
    unit1Ports[id] = { vlan: '100', name: 'Wolny' };
  } else if (i === 12) {
    unit1Ports[id] = { vlan: '100', name: 'Stacja_Ladowania' };
  } else if (i >= 13 && i <= 22) {
    unit1Ports[id] = { vlan: '100', name: 'Wolny' };
  } else if (i === 23) {
    unit1Ports[id] = { vlan: '100', name: 'Telefon_1' };
  } else if (i === 24) {
    unit1Ports[id] = { vlan: '100', name: 'Telefon_2' };
  } else if (i >= 25 && i <= 26) {
    unit1Ports[id] = { vlan: '999', allowedVlans: ['50', '100', '200', '300', '400', '500', '1111'], type: 'trunk', name: 'Wolny' };
  } else {
    unit1Ports[id] = { vlan: '1', name: 'Wolny' };
  }
}

// Port ranges for unit 2
const unit2Ports = {};
for (let i = 1; i <= 50; i++) {
  const id = getPortId(i);
  if (i >= 1 && i <= 5) {
    unit2Ports[id] = { vlan: '300', name: 'Kamera' };
  } else if (i >= 6 && i <= 20) {
    unit2Ports[id] = { vlan: '300', name: 'Wolny' };
  } else if (i >= 21 && i <= 24) {
    unit2Ports[id] = { vlan: '300', name: 'Rejestrator' };
  } else if (i === 25) {
    unit2Ports[id] = { vlan: '300', name: 'Wolny' };
  } else if (i === 26) {
    unit2Ports[id] = { vlan: '300', name: 'Jarek_Pensjonat' };
  } else {
    unit2Ports[id] = { vlan: '1', name: 'Wolny' };
  }
}

// Port ranges for unit 5
const unit5Ports = {};
for (let i = 1; i <= 50; i++) {
  const id = getPortId(i);
  if (i >= 1 && i <= 6) {
    unit5Ports[id] = { vlan: '100', name: `Biuro_Dol_${i}` };
  } else if (i >= 7 && i <= 8) {
    unit5Ports[id] = { vlan: '100', name: `Kasa_Magazyn_${i - 6}` };
  } else if (i === 9) {
    unit5Ports[id] = { vlan: '100', name: 'TEST_NAZWY' };
  } else if (i >= 10 && i <= 14) {
    unit5Ports[id] = { vlan: '100', name: `Sklep_${i - 9}` };
  } else if (i >= 15 && i <= 18) {
    unit5Ports[id] = { vlan: '100', name: `Kuchnia_${i - 14}` };
  } else if (i >= 19 && i <= 20) {
    unit5Ports[id] = { vlan: '100', name: `Biuro_Marcin_${i - 18}` };
  } else if (i === 21) {
    unit5Ports[id] = { vlan: '100', name: 'TEST_NAZWY' };
  } else if (i === 22) {
    unit5Ports[id] = { vlan: '100', name: 'Biuro_Marcin_4' };
  } else if (i >= 23 && i <= 24) {
    unit5Ports[id] = { vlan: '100', name: `Sala_Gora_${i - 22}` };
  } else if (i >= 25 && i <= 30) {
    unit5Ports[id] = { vlan: '100', name: 'Bar' };
  } else if (i >= 31 && i <= 32) {
    unit5Ports[id] = { vlan: '100', name: 'Grill' };
  } else if (i === 33) {
    unit5Ports[id] = { vlan: '100', name: 'Centrala_tel' };
  } else if (i === 34) {
    unit5Ports[id] = { vlan: '100', name: 'Serwer_Net' };
  } else if (i >= 35 && i <= 36) {
    unit5Ports[id] = { vlan: '100', name: 'Fotowoltaika' };
  } else if (i >= 37 && i <= 39) {
    unit5Ports[id] = { vlan: '100', name: 'TEST_NAZWY' };
  } else if (i === 40) {
    unit5Ports[id] = { vlan: '100', name: 'Alarm' };
  } else if (i >= 41 && i <= 48) {
    unit5Ports[id] = { vlan: '100', name: 'TEST_NAZWY' };
  } else if (i === 49) {
    unit5Ports[id] = { vlan: '999', allowedVlans: ['50', '100', '200', '300', '400', '500', '1111'], type: 'trunk', name: 'Trunk_Mikrotik' };
  } else if (i === 50) {
    unit5Ports[id] = { vlan: '999', allowedVlans: ['50', '100', '200', '300', '400', '500', '1111'], type: 'trunk', name: 'Trunk_Serwer' };
  }
}

const unit1Id = uuid();
const unit2Id = uuid();
const unit5Id = uuid();
const sg500TemplateId = uuid();

const model = {
  title: 'Cisco SG500 Stack',
  version: '1.0',
  icons: [],
  colors: ['#0f172a', '#1e293b', '#cbd5e1'],
  deviceTemplates: [
    {
      id: sg500TemplateId,
      name: 'Cisco SG500-52',
      kind: 'SWITCH',
      formFactor: 'RACK',
      numbering: 'ODD_EVEN',
      switchRole: 'SW',
      sections: [
        { id: 'rj45', media: 'RJ45', ports: 48 },
        { id: 'sfp', media: 'SFP', ports: 2 }
      ]
    }
  ],
  items: [
    {
      id: unit1Id,
      name: 'SG500 Unit 1',
      description: 'Management: 10.0.111.2/24 (VLAN 1111), Default: 10.64.200.10/24 (VLAN 1)',
      icon: sg500TemplateId,
      ports: unit1Ports,
      svis: [
        { id: uuid(), vlan: '1', ip: '10.64.200.10/24' },
        { id: uuid(), vlan: '1111', ip: '10.0.111.2/24' }
      ]
    },
    {
      id: unit2Id,
      name: 'SG500 Unit 2',
      icon: sg500TemplateId,
      ports: unit2Ports
    },
    {
      id: unit5Id,
      name: 'SG500 Unit 5',
      icon: sg500TemplateId,
      ports: unit5Ports
    }
  ],
  views: [
    {
      id: uuid(),
      name: 'Plan',
      items: [
        {
          id: uuid(),
          item: unit1Id,
          tile: { x: 10, y: 10 }
        },
        {
          id: uuid(),
          item: unit2Id,
          tile: { x: 10, y: 20 }
        },
        {
          id: uuid(),
          item: unit5Id,
          tile: { x: 10, y: 30 }
        }
      ],
      connectors: [],
      textBoxes: [],
      rectangles: []
    }
  ]
};

fs.writeFileSync('cisco_sg500_stack.json', JSON.stringify(model, null, 2));
console.log('Successfully wrote cisco_sg500_stack.json');
