import os
import sys

def process_file(file_path, mode):
    print("Processing file:", file_path) # Console logging

    with open(file_path, 'r', encoding='utf-8') as file:
        lines = file.readlines()

    with open(file_path, 'w', encoding='utf-8') as file:
        for i, line in enumerate(lines):
            if 'font-family: var(--font) !important;' in line:
                if mode == '-off' and not line.strip().startswith('/*'):
                    # Check to avoid double commenting
                    new_line = '/* ' + line.rstrip() + ' */\n'
                    print("Line edited:", line.strip(), "->", new_line.strip()) # Console logging
                    lines[i] = new_line
                elif mode == '-on' and line.strip().startswith('/*'):
                    # Check to only uncomment commented lines
                    new_line = line.replace('/* ', '').replace(' */', '')
                    print("Line edited:", line.strip(), "->", new_line.strip()) # Console logging
                    lines[i] = new_line
            elif mode == '-off':
                if 'libraryText: "🎮🎮🕹️🕹️🖲️💽" ' in line:
                    new_line = line.replace('🎮🎮🕹️🕹️🖲️💽', 'Home')
                    print("Line edited:", line.strip(), "->", new_line.strip()) # Console logging
                    lines[i] = new_line
            elif mode == '-on':
                if 'libraryText: "Home"' in line:
                    new_line = line.replace('Home', '🎮🎮🕹️🕹️🖲️💽')
                    print("Line edited:", line.strip(), "->", new_line.strip()) # Console logging
                    lines[i] = new_line
            file.write(lines[i])

def process_css_files(mode):
    current_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'css')
    css_files = [f for f in os.listdir(current_dir) if f.endswith('.css')]

    for css_file in css_files:
        file_path = os.path.join(current_dir, css_file)
        process_file(file_path, mode)

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
            file.write(lines[i])

if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else None

    if mode == '-off' or mode == '-on':
        print("Mode:", mode) # Console logging
        process_css_files(mode)
        process_config_js(mode)
    else:
        print('Invalid mode. Please use -off or -on.')
