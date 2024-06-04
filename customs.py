import os
import sys

def process_file(file_path, mode):
	print("Processing file:", file_path)  # Console logging

	# Read the file
	with open(file_path, 'r', encoding='utf-8') as file:
		lines = file.readlines()

	# Process the lines
	for i, line in enumerate(lines):
		if 'font-family: var(--font) !important;' in line:
			if mode == '-off' and not line.strip().startswith('/*'):
				# Check to avoid double commenting
				new_line = '/* ' + line.rstrip() + ' */\n'
				print("Line edited:", line.strip(), "->", new_line.strip())  # Console logging
				lines[i] = new_line
			elif mode == '-on' and line.strip().startswith('/*'):
				# Check to only uncomment commented lines
				new_line = line.replace('/* ', '').replace(' */', '')
				print("Line edited:", line.strip(), "->", new_line.strip())  # Console logging
				lines[i] = new_line

		if '--libraryText:' in line:
			print("fuck")
			print("fuck")
			print("fuck")
			if mode == '-off':
				start_index = line.index('--libraryText: ') + len('--libraryText: ')
				end_index = line.index(';	/* changes the home text in the library*/')
				new_line = line[:start_index] + '"Home"' + line[end_index:]
				print("Line edited:", line.strip(), "->", new_line.strip())  # Console logging
				lines[i] = new_line
			elif mode == '-on':
				new_line = line.replace('Home', '🎮🎮🕹️🕹️🖲️💽')
				print("Line edited:", line.strip(), "->", new_line.strip())  # Console logging
				lines[i] = new_line

	# Write the modified lines back to the file
	with open(file_path, 'w', encoding='utf-8') as file:
		file.writelines(lines)


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
		css_files.append(os.path.join(root, config_css_path))
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

if __name__ == '__main__':
	mode = sys.argv[1] if len(sys.argv) > 1 else None

	if mode == '-off' or mode == '-on':
		print("Mode:", mode) # Console logging
		process_css_files(mode)
		process_config_js(mode)
		process_skin_json(mode)
	else:
		print('Invalid mode. Please use -off or -on.')
