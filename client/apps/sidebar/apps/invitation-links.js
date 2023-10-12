/**
 * Game Invitation Links Reference
 * @extends {Application}
 */
class InvitationLinks extends Application {
  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "invitation-links",
      template: "templates/sidebar/apps/invitation-links.html",
      title: game.i18n.localize("INVITATIONS.Title"),
      width: 400
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async getData(options={}) {
    let addresses = game.data.addresses;
    // Check for IPv6 detection, and don't display connectivity info if so
    if ( addresses.remote === undefined ) return addresses;

    // Otherwise, handle remote connection test
    if ( addresses.remoteIsAccessible == null ) {
      addresses.remoteClass = "unknown-connection";
      addresses.remoteTitle = game.i18n.localize("INVITATIONS.UnknownConnection");
      addresses.failedCheck = true;
    } else if ( addresses.remoteIsAccessible ) {
      addresses.remoteClass = "connection";
      addresses.remoteTitle = game.i18n.localize("INVITATIONS.OpenConnection");
      addresses.canConnect = true;
    } else {
      addresses.remoteClass = "no-connection";
      addresses.remoteTitle = game.i18n.localize("INVITATIONS.ClosedConnection");
      addresses.canConnect = false;
    }
    return addresses;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);
    html.find(".invite-link").click(ev => {
      ev.preventDefault();
      ev.target.select();
      game.clipboard.copyPlainText(ev.currentTarget.value);
      ui.notifications.info("INVITATIONS.Copied", {localize: true});
    });
    html.find(".refresh").click(ev => {
      ev.preventDefault();
      const icon = ev.currentTarget;
      icon.className = "fas fa-sync fa-pulse";
      let me = this;
      setTimeout(function(){
        game.socket.emit("refreshAddresses",  addresses => {
          game.data.addresses = addresses;
          me.render(true);
        });
      }, 250)
    });
    html.find(".show-hide").click(ev => {
      ev.preventDefault();
      const icon = ev.currentTarget;
      const showLink = icon.classList.contains("show-link");
      if ( showLink ) {
        icon.classList.replace("fa-eye", "fa-eye-slash");
        icon.classList.replace("show-link", "hide-link");
      }
      else {
        icon.classList.replace("fa-eye-slash", "fa-eye");
        icon.classList.replace("hide-link", "show-link");
      }
      icon.closest("form").querySelector('#remote-link').type = showLink ? "text" : "password";
    });
  }
}
