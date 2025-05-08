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
const GIT_COMMANDS = {
  CURRENT_BRANCH: "git symbolic-ref --short HEAD",
  UPSTREAM_BRANCH: (branch: string) => `git rev-parse --symbolic-full-name --abbrev-ref ${branch}@{upstream}`,
  LOCAL_COMMITS: "git log --oneline",
  LOCAL_COMMITS_TRACKING: (upstreamBranch: string, branch: string) => `git log --oneline ${upstreamBranch}..${branch}`,
  SQUASH_AND_COMMIT: (commitID: string) => `git reset --soft ${commitID}~1 && git commit --amend`,
  HAS_A_PARENT: (commitID: string) => `git rev-list --parents -n 1 ${commitID}`,
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
 * Checks if a commit has a parent commit.
 *
 * @param {string} commitID - The ID of the commit to check
 * @param {string} workspaceFolder - Path to the workspace folder
 * @returns {Promise<boolean>} A Promise that resolves to true if the commit has a parent, false otherwise
 */
const hasParent = async (commitID: string, workspaceFolder: string): Promise<boolean> => {
  try {
    const output = await execGitCommand(GIT_COMMANDS.HAS_A_PARENT(commitID), workspaceFolder);
    return output.split(" ").length > 1;
  } catch {
    return false;
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
      quickPick.items = commits.map((commit, index, commits) => ({
        label: `$(git-commit) Commit: ${commit}`,
        description: getDescription(index, commits),
      }));
      quickPick.show();

      quickPick.onDidAccept(() => {
        const selectedItem = quickPick.selectedItems[0];
        quickPick.hide();
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
 * Activates the extension and registers the squash-push command.
 * This is the main entry point for the extension.
 *
 * @param {vscode.ExtensionContext} context - The VS Code extension context
 */
export function activate(context: vscode.ExtensionContext) {
  /**
   * Command handler for the squash-push.squashCommits command.
   * Identifies the current branch, upstream branch, and allows selection of a base commit for squashing.
   * The command performs the following steps:
   * 1. Checks if a workspace folder exists
   * 2. Verifies the user is not in a detached HEAD state
   * 3. Gets the upstream branch if it exists
   * 4. Retrieves local commits that haven't been pushed
   * 5. Allows user to select a base commit for squashing
   * 6. Verifies the selected commit has a parent
   * 7. Performs the squash operation
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

    //Show the list of commits to the user and allow selection of a base commit(selected_commit~1)
    let selectedCommit: string | undefined;
    selectedCommit = await showCommitSelection(localCommits);
    const commitID = getCommitID(selectedCommit);
    if (!commitID) {
      return;
    }

    //check if a parent exists for the selected commit , if a squash is tried with first commit as base it will fail
    const hasAParent = await hasParent(commitID, workspaceFolder);
    if (!hasAParent) {
      vscode.window.showErrorMessage("You cannot squash onto the root commit.");
      return;
    }

    //Run a squash based on the last selected commit, and open the commit message to be filled by the user after
    try {
      await execGitCommand(GIT_COMMANDS.SQUASH_AND_COMMIT(commitID), workspaceFolder);
      vscode.window.showInformationMessage("Commits squashed");
    } catch (err) {
      vscode.window.showErrorMessage("An Error Occurred while squashing commits");
      console.error("An Error Occurred while squashing", err);
      return;
    }

    context.subscriptions.push(disposable);
  });
}
function getDescription(index: number, commits: string[]): any {
  if (index === 0) {
    return "\t(Most recent)";
  } else if (index === commits.length - 1) {
    return "\t(Oldest)";
  }
}

