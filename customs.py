import os
import sys
import zipfile
import re

def process_file(file_path, mode):
    print("Processing file:", file_path)  # Console logging


def process_css_files(mode):
    # Get the current directory path where the script is located
    current_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'css')
    css_files = []
    # Edit "config.css" in the current working directory
    config_css_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config.css')

    # Walk through the current directory and subdirectories
    for root, dirs, files in os.walk(current_dir):
        for file in files:
            if file.endswith('.css'):
                css_files.append(os.path.join(root, file))
    if os.path.exists(config_css_path):
        print(config_css_path)
        css_files.append(config_css_path)
    else:
        print(f"'config.css' not found in {os.path.dirname(os.path.abspath(__file__))}")
    
    # Log found CSS files
    print(css_files)
    for css_file in css_files:
        process_file(css_file, mode)

def process_config_js(mode):
    config_file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config.js')
    if not os.path.exists(config_file_path):
        print("config.js not found.")
        return

    with open(config_file_path, 'r', encoding='utf-8') as file:
        lines = file.readlines()

    with open(config_file_path, 'w', encoding='utf-8') as file:
        for i, line in enumerate(lines):
            if 'export const filePathPrefix =' in line:
                if mode == '-off':
                    new_line = 'export const filePathPrefix ="skins/ATOMS";\n'
                elif mode == '-on':
                    new_line = 'export const filePathPrefix ="skins/ATOMS-git";\n'
                print("Line edited:", line.strip(), "->", new_line.strip()) # Console logging
                lines[i] = new_line
            if 'export const systemAccentsEnabled =' in line:
                new_line = 'export const systemAccentsEnabled ="0";\n'
                print("Line edited:", line.strip(), "->", new_line.strip()) # Console logging
                lines[i] = new_line
            file.write(lines[i])

def process_skin_json(mode):
    skin_file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'skin.json')
    if not os.path.exists(skin_file_path):
        print("skin.json not found.")
        return

    with open(skin_file_path, 'r', encoding='utf-8') as file:
        lines = file.readlines()

    with open(skin_file_path, 'w', encoding='utf-8') as file:
        for i, line in enumerate(lines):
            if '"name":"ATOMS' in line:
                if mode == '-off':
                    new_line = '\t"name":"ATOMS",\n'
                elif mode == '-on':
                    new_line = '\t"name":"ATOMS-git",\n'
                print("Line edited:", line.strip(), "->", new_line.strip()) # Console logging
                lines[i] = new_line
            file.write(lines[i])

def zip_files():
    zip_filename = 'ATOMS.zip'
    exclude_extensions = {'.py', '.md', '.zip'}
    exclude_dirs = {'.git'}
    base_dir = os.path.dirname(os.path.abspath(__file__))

    with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(base_dir):
            # Exclude directories
            dirs[:] = [d for d in dirs if d not in exclude_dirs]
            for file in files:
                if not (root == base_dir and os.path.splitext(file)[1] in exclude_extensions):
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, base_dir)
                    zipf.write(file_path, os.path.join('ATOMS', arcname))
    print(f"Created zip file {zip_filename}")

if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else None

    if mode == '-off' or mode == '-on':
        print("Mode:", mode) # Console logging
        process_css_files(mode)
        process_config_js(mode)
        process_skin_json(mode)
        if mode == '-off':
            zip_files()
    else:
        print('Invalid mode. Please use -off or -on.')
