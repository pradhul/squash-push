import * as vscode from "vscode";
import { exec } from "child_process";

/**
 * Object containing Git command templates used throughout the extension.
 * 
 * @property {string} CURRENT_BRANCH - Command to get the current branch name
 * @property {Function} UPSTREAM_BRANCH - Function that returns command to get upstream branch
 * @property {string} LOCAL_COMMITS - Command to get all commit logs
 * @property {Function} LOCAL_COMMITS_TRACKING - Function that returns command to get commits between branches
 * @property {Function} SQUASH_AND_COMMIT - Function that returns command to squash commits
 * @property {Function} HAS_A_PARENT - Function that returns command to check if a commit has a parent
 */
/**
 * Object containing Git command templates used throughout the extension.
 * These commands are used to interact with the Git repository.
 * 
 * @property {string} CURRENT_BRANCH - Command to get the current branch name
 * @property {Function} UPSTREAM_BRANCH - Function that returns command to get upstream branch
 * @property {string} LOCAL_COMMITS - Command to get all commit logs
 * @property {Function} LOCAL_COMMITS_TRACKING - Function that returns command to get commits between branches
 * @property {Function} SQUASH_AND_COMMIT - Function that returns command to squash commits and open commit editor
 */
const GIT_COMMANDS = {
  CURRENT_BRANCH: "git symbolic-ref --short HEAD",
  UPSTREAM_BRANCH: (branch: string) => `git rev-parse --symbolic-full-name --abbrev-ref ${branch}@{upstream}`,
  LOCAL_COMMITS: "git log --oneline",
  LOCAL_COMMITS_TRACKING: (upstreamBranch: string, branch: string) => `git log --oneline ${upstreamBranch}..${branch}`,
  SQUASH_AND_COMMIT: (commitID: string) => `git reset --soft ${commitID} && git commit --amend`,
};

/**
 * Executes a Git command in the specified directory.
 *
 * @param {string} command - The Git command to execute
 * @param {string} cwd - The current working directory where the command should be executed
 * @returns {Promise<string>} A Promise that resolves with the command output or rejects with an error message
 */
function execGitCommand(command: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, { cwd, env: { ...process.env, EDITOR: "code --wait" } }, (error, stdout, stderr) => {
      if (error) {
        reject(stderr || error.message);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

/**
 * Retrieves the name of the current Git branch.
 *
 * @param {string} workspaceFolder - Path to the workspace folder
 * @returns {Promise<string | null>} A Promise that resolves with the current branch name or null if in detached HEAD state
 */
const getCurrentBranch = async (workspaceFolder: string): Promise<string | null> => {
  try {
    return await execGitCommand(GIT_COMMANDS.CURRENT_BRANCH, workspaceFolder);
  } catch {
    return null;
  }
};

/**
 * Determines the upstream branch for the current branch.
 *
 * @param {string} currentBranch - The name of the current branch
 * @param {string} workspaceFolder - Path to the workspace folder
 * @returns {Promise<string | null>} A Promise that resolves with the upstream branch name or null if no upstream is configured
 */
const getCurrentUpStreamBranch = async (currentBranch: string, workspaceFolder: string): Promise<string | null> => {
  try {
    return await execGitCommand(GIT_COMMANDS.UPSTREAM_BRANCH(currentBranch), workspaceFolder);
  } catch {
    return null;
  }
};

/**
 * Retrieves a list of local commits based on the provided Git command.
 *
 * @param {string} localCommitLogsCmd - The Git command to retrieve commit logs
 * @param {string} workspaceFolder - Path to the workspace folder
 * @returns {Promise<string | null>} A Promise that resolves with a string containing the commit logs or null if an error occurs
 */
const getLocalCommits = async (localCommitLogsCmd: string, workspaceFolder: string): Promise<string | null> => {
  try {
    return await execGitCommand(localCommitLogsCmd, workspaceFolder);
  } catch {
    return null;
  }
};

/**
 * Displays a quick pick selection UI with the list of commits.
 *
 * @param {string} localCommits - String containing commit logs separated by newlines
 * @returns {Promise<string[] | undefined>} A Promise that resolves with the selected commits or undefined if selection failed
 */
const showCommitSelection = async (localCommits: string): Promise<string | undefined> => {
  const commits: string[] = localCommits.split("\n");
  return new Promise((resolve, reject) => {
    try {
      const quickPick = vscode.window.createQuickPick();
      quickPick.canSelectMany = false;
      quickPick.title = "Select the oldest commit to keep as base";
      quickPick.placeholder = "Select the base commit — commits after this will be squashed into it";
      quickPick.items = commits.map((commit, index, commits) => ({
        label: `$(git-commit) Commit: ${commit}`,
        description: getDescription(index, commits),
      }));
      quickPick.show();

      quickPick.onDidAccept(() => {
        const selectedItem = quickPick.selectedItems[0];
        const selectedIndex = quickPick.items.findIndex((item) => item.label === selectedItem.label);
        collapseAnimation(selectedIndex, quickPick, commits);
        resolve(selectedItem.label);
      });

      quickPick.onDidHide(() => {
        quickPick.dispose();
        resolve("");
      });
    } catch {
      resolve("");
    }
  });
};

/**
 * Creates a visual animation effect showing commits being squashed into the selected base commit.
 * 
 * @param {number} selectedIndex - The index of the selected commit in the commits array
 * @param {vscode.QuickPick<vscode.QuickPickItem>} quickPick - The VS Code QuickPick UI component
 * @param {string[]} commits - Array of commit strings
 * @returns {void}
 */
const collapseAnimation = (
  selectedIndex: number,
  quickPick: vscode.QuickPick<vscode.QuickPickItem>,
  commits: string[]
): void => {
  // Animate collapsing the commits above the selected one
  let i = 0;
  const animationDurationPerItem = 200; // ms
  const totalDuration = commits.length * animationDurationPerItem;

  const animate = () => {
    if (i < selectedIndex) {
      const newItems = [...quickPick.items];
      newItems[i] = {
        label: `$(arrow-down) ${commits[i]}`,
        description: "Squashing...",
      };
      quickPick.items = newItems;
      i++;
      setTimeout(animate, animationDurationPerItem); // animation step every 200ms
    } else {
      quickPick.items = [
        {
          label: `$(check) ${commits[selectedIndex]}`,
          description: "Final base commit",
        },
      ];
      setTimeout(() => {
        quickPick.hide();
        vscode.window.showInformationMessage(`Ready to squash above: ${commits[selectedIndex]}`);
      }, totalDuration);
    }
  };

  animate();
};

/**
 * Extracts the commit ID from the selected commit and validates the selection.
 *
 * @param {string[] | undefined} selectedCommit - Array of selected commit strings from the quick pick UI
 * @returns {string | null} The commit ID if exactly one commit is selected, null otherwise
 */
const getCommitID = (selectedCommit: string | undefined): string | null => {
  if (!selectedCommit) {
    return null;
  }
  return selectedCommit.split(" ")[2];
};

/**
 * Generates a description for a commit based on its position in the commit history.
 * 
 * @param {number} index - The index of the commit in the commits array
 * @param {string[]} commits - Array of commit strings
 * @returns {string | undefined} A description string for the commit or undefined for commits in the middle
 */
function getDescription(index: number, commits: string[]): string | undefined {
  if (index === 0) {
    return "\t(Most recent)";
  } else if (index === commits.length - 1) {
    return "\t(Oldest)";
  }
  return undefined;
}

/**
 * Activates the extension and registers the squash-push command.
 * This is the main entry point for the extension.
 *
 * @param {vscode.ExtensionContext} context - The VS Code extension context
 */
/**
 * Activates the extension and registers the squash-push command.
 * This is the main entry point for the extension.
 * 
 * @param {vscode.ExtensionContext} context - The VS Code extension context
 * @returns {void}
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "squash-push" is now active!');

  /**
   * Command handler for the squash-push.squashCommits command.
   * Identifies the current branch, upstream branch, and allows selection of a base commit for squashing.
   *
   * The command performs the following steps:
   * 1. Checks if a workspace folder exists
   * 2. Verifies the user is not in a detached HEAD state
   * 3. Gets the upstream branch if it exists
   * 4. Retrieves local commits that haven't been pushed
   * 5. Allows user to select a base commit for squashing with visual animation
   * 6. Performs the squash operation
   * 7. Opens the commit message editor for the user to edit the final commit message
   */
  const disposable = vscode.commands.registerCommand("squash-push.squashCommits", async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!workspaceFolder) {
      vscode.window.showErrorMessage("No workspace folder found.");
      return;
    }

    //Ensure the user is not in a detached HEAD, and get the current branch
    const currentBranch: string | null | undefined = await getCurrentBranch(workspaceFolder);
    if (!currentBranch) {
      vscode.window.showErrorMessage("You are maybe in detached State, please checkout to a branch");
      return;
    }

    //Get the current tracking upstream branch
    const currentUpstreamBranch = await getCurrentUpStreamBranch(currentBranch, workspaceFolder);

    //Get only the unpushed(local commits)
    let localCommitLogsCmd: string = GIT_COMMANDS.LOCAL_COMMITS;
    if (currentUpstreamBranch) {
      localCommitLogsCmd = GIT_COMMANDS.LOCAL_COMMITS_TRACKING(currentUpstreamBranch, currentBranch);
    }
    const localCommits: string | null | undefined = await getLocalCommits(localCommitLogsCmd, workspaceFolder);
    if (!localCommits) {
      vscode.window.showInformationMessage("No local commits found.");
      return;
    }

    //Show the list of commits to the user and allow selection of a base commit(selected_commit)
    let selectedCommit: string | undefined;
    selectedCommit = await showCommitSelection(localCommits);
    const commitID = getCommitID(selectedCommit);
    if (!commitID) {
      return;
    }

    //Run a squash based on the last selected commit, and open the commit message to be filled by the user after
    try {
      vscode.window.showInformationMessage(
        "Squashing commits. Edit the message or close the editor to keep the default"
      );
      await execGitCommand(GIT_COMMANDS.SQUASH_AND_COMMIT(commitID), workspaceFolder);
      vscode.window.showInformationMessage("Commits squashed!");
    } catch (err) {
      vscode.window.showErrorMessage("An Error Occurred while squashing commits");
      console.error("An Error Occurred while squashing", err);
      return;
    }

    context.subscriptions.push(disposable);
  });
}


