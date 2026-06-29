// f_addfolder.js

/**
 * Opens a native directory picker dialog and returns the selected path
 * @param {HTMLElement} txtStatus - The UI element to display operation status
 * @returns {Promise<string|null>} The selected folder path, or null if cancelled/failed
 */
export async function pickLibraryFolder(txtStatus) {
  try {
    // Dynamically safely load the Tauri v2 dialog plugin directly from the injected API
    const dialogPlugin = window.__TAURI__.dialog; 
    
    // Invoke native OS folder picker dialog
    const selectedFolder = await dialogPlugin.open({
      directory: true,
      multiple: false,
      title: "Select PDF Library Folder"
    });

    if (selectedFolder) {
      txtStatus.innerText = `Selected: ${selectedFolder}`;
      txtStatus.style.color = "green";
      return selectedFolder; // Return path back to main.js orchestrator
    } else {
      txtStatus.innerText = "Folder selection cancelled.";
      txtStatus.style.color = "orange";
      return null;
    }
  } catch (error) {
    console.error("Error picking folder:", error);
    txtStatus.innerText = "Error selecting folder.";
    txtStatus.style.color = "red";
    return null;
  }
}