Your task is to create a new worktree named '$ARGUMENTS' in the .trees/$ARGUMENTS folder.

Follow these steps: 

1. Make sure you are in the project root folder.
2. Check if an existing folder in the .trees folder with the name $ARGUMENTS already exists. If it does, stop here and tell the user the worktree already exists.
3. Create a new git worktree in the .trees folder with the name $ARGUMENTS.
4. Symlink the .venv folder into the worktree directory
5. Launches a new VSCode editor instance in that directory by running the 'code .' command in the worktree directory