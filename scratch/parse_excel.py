import zipfile
import xml.etree.ElementTree as ET
import os
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')
templates_dir = r'c:\Users\olwal\gregu\TEMPLATES'

def parse_excel_to_sections(filepath):
    filename = os.path.basename(filepath)
    with zipfile.ZipFile(filepath, 'r') as z:
        shared_strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            ss_tree = ET.fromstring(z.read('xl/sharedStrings.xml'))
            ns = {'main': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
            for si in ss_tree.findall('.//main:si', ns):
                t_elems = si.findall('.//main:t', ns)
                text = ''.join([t.text or '' for t in t_elems])
                shared_strings.append(text)
        
        stree = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
        ns = {'main': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        
        rows_data = []
        for row in stree.findall('.//main:row', ns):
            r_idx = int(row.attrib.get('r'))
            cells = {}
            for cell in row.findall('./main:c', ns):
                r_ref = cell.attrib.get('r')
                col_let = ''.join([c for c in r_ref if c.isalpha()])
                c_type = cell.attrib.get('t')
                v_elem = cell.find('./main:v', ns)
                val = v_elem.text if v_elem is not None else ''
                if c_type == 's' and val.isdigit():
                    val = shared_strings[int(val)] if int(val) < len(shared_strings) else val
                cells[col_let] = val
            rows_data.append((r_idx, cells))
            
    print(f'=== {filename} ===')
    sections = []
    current_sec = None
    
    for r_idx, cells in rows_data:
        col_a = cells.get('A', '').strip()
        col_b = cells.get('B', '').strip()
        col_c = cells.get('C', '').strip()
        col_d = cells.get('D', '').strip()
        col_f = cells.get('F', '').strip()
        col_h = cells.get('H', '').strip()
        
        # Check header rows
        if col_d in ['Checklist Item', 'Item', 'Task'] or col_a in ['#', 'No']:
            continue
            
        if col_d and len(col_d) > 3:
            sec_name = col_b if col_b else (current_sec['name'] if current_sec else 'General')
            sub_cat = col_c
            item_text = col_d
            
            if not current_sec or current_sec['name'] != sec_name:
                current_sec = {'name': sec_name, 'subCategories': [], 'items': []}
                sections.append(current_sec)
            current_sec['subCategories'].append(sub_cat)
            current_sec['items'].append(item_text)
            
    print(f'Total sections: {len(sections)}, total items: {sum(len(s["items"]) for s in sections)}')
    for s in sections:
        print(f'  Section: "{s["name"]}" ({len(s["items"])} items)')

for f in os.listdir(templates_dir):
    if f.endswith('.xlsx'):
        parse_excel_to_sections(os.path.join(templates_dir, f))
