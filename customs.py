import os
import sys

def process_file(file_path, mode):
    with open(file_path, 'r', encoding='utf-8') as file:
        lines = file.readlines()

    with open(file_path, 'w', encoding='utf-8') as file:
        for i, line in enumerate(lines):
            if 'font-family: var(--font) !important;' in line:
                if mode == '-off':
                    lines[i] = '/* ' + line.rstrip() + ' */\n'
                elif mode == '-on':
                    lines[i] = line.replace('/* ', '').replace(' */', '')
            elif mode == '-off':
                if 'YourLibraryName: "🎮🎮🕹️🕹️🖲️💽"' in line:
                    lines[i] = line.replace('🎮🎮🕹️🕹️🖲️💽', 'Home')
            elif mode == '-on':
                if 'YourLibraryName: "Home"' in line:
                    lines[i] = line.replace('Home', '🎮🎮🕹️🕹️🖲️💽')
            file.write(lines[i])

def process_css_files(mode):
    current_dir = os.path.dirname(os.path.abspath(__file__))
    css_files = [f for f in os.listdir(current_dir) if f.endswith('.css')]

    for css_file in css_files:
        file_path = os.path.join(current_dir, css_file)
        process_file(file_path, mode)

if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else None

    if mode == '-off' or mode == '-on':
        process_css_files(mode)
    else:
        print('Invalid mode. Please use -off or -on.')
