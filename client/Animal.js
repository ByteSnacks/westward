/**
 * Created by Jerome on 04-10-17.
 */
var Animal = new Phaser.Class({

    Extends: Moving,

    initialize: function Animal() {
        Moving.call(this,0,0);
        this.entityType = 'animal';
        this.orientationPin = new OrientationPin('animal');
    },

    setUp: function(data){
        //Engine.animalUpdates.add(data.id,'create');
        if(Engine.animals.hasOwnProperty(data.id)){
            if(Engine.debug) console.warn('duplicate animal ',data.id,'at',data.x,data.y,'last seen at ',
                Engine.animals[data.id].tileX,',',Engine.animals[data.id].tileY);
            Engine.animals[data.id].remove();
        }

        var animalData = Engine.animalsData[data.type];
        this.id = data.id;

        Engine.animals[this.id] = this;
        Engine.entityManager.addToDisplayList(this);

        this.setPosition(data.x,data.y);
        this.setTexture(animalData.sprite);
        this.setFrame(animalData.frame);
        this.setDisplayOrigin(0);
        this.setInteractive();
        this.setVisible(true);
        this.dead = false;
        this.name = animalData.name+' '+this.id;
        this.animPrefix = animalData.walkPrefix;
        this.footprintsFrame = animalData.footprintsFrame;
        this.printsVertOffset = animalData.printsVertOffset;
        this.restingFrames = animalData.restingFrames;

        this.manageOrientationPin();
    },

    update: function(data){
        //Engine.animalUpdates.add(this.id,'update');
        if(data.path) this.queuePath(data.path);
        if(data.stop) this.serverStop(data.stop.x,data.stop.y); // TODO: move to new Moving update() supermethod
        if(data.melee_atk) {
            this.computeOrientation(this.tileX,this.tileY,data.melee_atk.x,data.melee_atk.y);
            this.faceOrientation();
            if(Utils.randomInt(1,10) >= 8) Engine.playLocalizedSound('wolfattack1',1,{x:this.tileX,y:this.tileY});
        }
        Engine.handleBattleUpdates(this,data);
        if(data.dead) this.die();
    },

    remove: function(){
        //console.log('remove ',this.id,'(',this.tileX,',',this.tileY,',',this.chunk,',)');
        //Engine.animalUpdates.add(this.id,'remove');
        CustomSprite.prototype.remove.call(this);
        this.orientationPin.hide();
        this.orientationPin.reset();
        delete Engine.animals[this.id];
    },

    die: function(){
        this.setFrame(49);
        this.dead = true;
    },

    // ### INPUT ###

    handleDown: function(){
        //UI.setCursor(UI.handCursor2);
    },

    handleClick: function(){
        if(BattleManager.inBattle){
            if(Engine.dead) return;
            BattleManager.processNPCClick(this);
        }else{
            Engine.processNPCClick(this);
        }
        //UI.setCursor(UI.handCursor);
    },

    setCursor: function(){
        if(!BattleManager.inBattle && Engine.inMenu) return;
        if(BattleManager.inBattle) {
            var dx = Math.abs(this.tileX-Engine.player.tileX);
            var dy = Math.abs(this.tileY-Engine.player.tileY);
            var cursor = (this.dead ? UI.cursor : (dx+dy == 1 || (dx == 1 && dy == 1) ? 'melee' : 'range'));
            UI.setCursor(cursor);
        }else{
            var cursor = (this.dead ? 'item' : 'combat');
            UI.setCursor(cursor);
        }
        UI.tooltip.updateInfo((this.dead ? 'Dead ' : '')+this.name);
        UI.tooltip.display();
    },

    handleOver: function(){
        UI.manageCursor(1,'animal',this);
    },

    handleOut: function(){
        UI.manageCursor(0,'animal');
        UI.tooltip.hide();
    }
});