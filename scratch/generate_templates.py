import zipfile
import xml.etree.ElementTree as ET
import os
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')
templates_dir = r'c:\Users\olwal\gregu\TEMPLATES'

file_map = {
    'ADH.xlsx': ('tpl-adh', 'ADH Monthly Checklist', ['ADH']),
    'AMM.xlsx': ('tpl-amm', 'AMM Law Monthly Checklist', ['AMM Law', 'AMM']),
    'BRC_Monthly_Checklist (3).xlsx': ('tpl-brc', 'BRC Consultancy Monthly Checklist', ['BRC Consultancy', 'Black Rose Communications']),
    'BRIQ.xlsx': ('tpl-briq', 'Briq Consultancy Monthly Checklist', ['Briq Consultancy', 'BRIQ']),
    'ULTIMATE.xlsx': ('tpl-ultimate', 'Ultimate Monthly Checklist', ['Ultimate'])
}

def parse_excel(filepath):
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
                cells[col_let] = val.strip()
            rows_data.append((r_idx, cells))
            
    sections = []
    current_sec = None
    
    for r_idx, cells in rows_data:
        col_a = cells.get('A', '')
        col_b = cells.get('B', '')
        col_c = cells.get('C', '')
        col_d = cells.get('D', '')
        
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
            
    return sections

all_templates = []
for filename, (tpl_id, tpl_name, client_types) in file_map.items():
    filepath = os.path.join(templates_dir, filename)
    sections = parse_excel(filepath)
    all_templates.append({
        'id': tpl_id,
        'name': tpl_name,
        'clientTypes': client_types,
        'sections': sections
    })

# Add general template for Multiplier / fallback
all_templates.append({
    'id': 'tpl-general',
    'name': 'General Monthly Checklist',
    'clientTypes': ['Multiplier'],
    'sections': [
        { 'name': "Billing & Revenue", 'subCategories': ["Invoicing","Revenue recognition","Revenue recognition"], 'items': ["Raise and dispatch all invoices for the month","Post all revenue to the correct ledger accounts","Reconcile revenue to collections and bank"] },
        { 'name': "Cash & Bank", 'subCategories': ["Bank reconciliation","Petty cash"], 'items': ["Prepare and sign off monthly bank reconciliation","Reconcile petty cash and replenish float"] },
        { 'name': "Payables & Receivables", 'subCategories': ["Creditors","Debtors"], 'items': ["Prepare creditors aging and process approved payment run","Prepare debtors aging and follow up on overdue accounts"] },
        { 'name': "Payroll & Tax", 'subCategories': ["Payroll","PAYE","VAT"], 'items': ["Process and approve payroll","File PAYE returns by the 9th","File VAT return by the 20th"] },
        { 'name': "Reporting", 'subCategories': ["Management accounts"], 'items': ["Prepare month-end management accounts and circulate to management"] }
    ]
})

with open(r'c:\Users\olwal\gregu\scratch\templates.json', 'w', encoding='utf-8') as out:
    json.dump(all_templates, out, indent=2, ensure_ascii=False)

print("Successfully generated templates.json!")
